import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

// MED-3: Promise-based singleton prevents race conditions on concurrent cold starts.
// The cache holds pre-built indexes so each request pays O(1) for exact lookups
// and O(log n) for autocomplete prefix search instead of O(n) per request.
let cachePromise = null;

function hasStockCode(entry) {
  return entry.stock_code && String(entry.stock_code).trim() !== '';
}

function formatStockCode(code) {
  return String(code).trim().padStart(6, '0');
}

function formatCorpCode(code) {
  return String(code).padStart(8, '0');
}

// Builds the cache object in a single pass over the parsed company list.
// Returns: { list, listedByName, anyByName, sortedSuggestList }
//   list             — original frozen array (for fuzzy O(n) fallback only)
//   listedByName     — Map<corp_name, formattedEntry> for listed companies (O(1) lookup)
//   anyByName        — Map<corp_name, formattedEntry> for all companies (O(1) lookup)
//   sortedSuggestList — pre-normalized, pre-sorted array for O(log n) prefix autocomplete
function buildCache(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  const listedByName = new Map();
  const anyByName = new Map();
  const suggestEntries = [];

  for (const entry of list) {
    const name = String(entry.corp_name);
    const isListed = hasStockCode(entry);
    const formattedEntry = {
      ...entry,
      corp_code: entry.corp_code ? formatCorpCode(entry.corp_code) : entry.corp_code,
      stock_code: isListed ? formatStockCode(entry.stock_code) : entry.stock_code,
    };

    // anyByName: first occurrence of a name wins (preserves original list priority)
    if (!anyByName.has(name)) anyByName.set(name, formattedEntry);
    // listedByName: first listed (has stock code) occurrence wins
    if (isListed && !listedByName.has(name)) listedByName.set(name, formattedEntry);

    suggestEntries.push({
      corp_name: name,
      corp_name_lower: name.toLowerCase(),
      stock_code: isListed ? formatStockCode(entry.stock_code) : '',
    });
  }

  // Sort once at startup so suggest requests can binary-search in O(log n)
  suggestEntries.sort((a, b) => a.corp_name_lower.localeCompare(b.corp_name_lower));

  return {
    list: Object.freeze(list),
    listedByName,
    anyByName,
    sortedSuggestList: Object.freeze(suggestEntries),
  };
}

async function getCompanyCache() {
  if (!cachePromise) {
    cachePromise = (async () => {
      const xmlPath = path.join(process.cwd(), 'corp.xml');
      const xmlData = await fs.readFile(xmlPath, 'utf-8');
      const parser = new XMLParser();
      const result = parser.parse(xmlData);
      const rawList = result?.result?.list || [];
      return buildCache(rawList);
    })();
  }
  return cachePromise;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const type = searchParams.get('type');

    if (!query) {
      if (type === 'suggest') return NextResponse.json({ suggestions: [] });
      return NextResponse.json({ error: 'Missing company name query' }, { status: 400 });
    }

    const { list, listedByName, anyByName, sortedSuggestList } = await getCompanyCache();

    if (type === 'suggest') {
      const lowerQuery = query.toLowerCase();

      // Binary search for the first entry whose name starts with lowerQuery.
      // O(log n) entry point, then O(k) to collect up to 10 matches.
      let lo = 0, hi = sortedSuggestList.length - 1, start = sortedSuggestList.length;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedSuggestList[mid].corp_name_lower < lowerQuery) {
          lo = mid + 1;
        } else {
          start = mid;
          hi = mid - 1;
        }
      }

      const matches = [];
      for (let i = start; i < sortedSuggestList.length && matches.length < 10; i++) {
        if (!sortedSuggestList[i].corp_name_lower.startsWith(lowerQuery)) break;
        matches.push({
          corp_name: sortedSuggestList[i].corp_name,
          stock_code: sortedSuggestList[i].stock_code,
        });
      }

      return NextResponse.json(
        { suggestions: matches },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
      );
    }

    // Company lookup priority (all O(1) except the fuzzy fallback):
    // 1. Exact name match among LISTED companies — most likely user intent
    // 2. Exact name match among ALL companies (including unlisted)
    // 3. Partial/substring name match among LISTED companies — O(n) fuzzy fallback
    const company =
      listedByName.get(query) ??
      anyByName.get(query) ??
      (() => {
        const raw = list.find(
          entry => String(entry.corp_name).includes(query) && hasStockCode(entry)
        );
        if (!raw) return undefined;
        return {
          ...raw,
          corp_code: raw.corp_code ? formatCorpCode(raw.corp_code) : raw.corp_code,
          stock_code: formatStockCode(raw.stock_code),
        };
      })();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(
      company,
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
