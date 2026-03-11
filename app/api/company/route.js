import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

let cachedList = null;

function hasStockCode(entry) {
  return entry.stock_code && String(entry.stock_code).trim() !== '';
}

function formatStockCode(code) {
  return String(code).trim().padStart(6, '0');
}

async function getCompanyList() {
  if (cachedList) return cachedList;
  const xmlPath = path.join(process.cwd(), 'corp.xml');
  const xmlData = await fs.readFile(xmlPath, 'utf-8');
  const parser = new XMLParser();
  const result = parser.parse(xmlData);
  cachedList = result?.result?.list || [];
  return cachedList;
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

    const list = await getCompanyList();

    if (type === 'suggest') {
      const lowerQuery = query.toLowerCase();
      const matches = [];
      for (const entry of list) {
         if (String(entry.corp_name).toLowerCase().startsWith(lowerQuery)) {
            matches.push({
              corp_name: entry.corp_name,
              stock_code: hasStockCode(entry) ? formatStockCode(entry.stock_code) : '',
            });
         }
         if (matches.length >= 10) break;
      }
      return NextResponse.json({ suggestions: matches });
    }

    // Company lookup priority:
    // 1. Exact name match among LISTED companies (have a stock code) — most likely user intent
    // 2. Exact name match among ALL companies (including unlisted)
    // 3. Partial/substring name match among LISTED companies — fallback fuzzy match
    let company = list.find(entry => entry.corp_name === query && hasStockCode(entry));

    if (!company) {
       company = list.find(entry => entry.corp_name === query);
    }

    if (!company) {
       company = list.find(entry =>
         String(entry.corp_name).includes(query) && hasStockCode(entry)
       );
    }

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const formattedCompany = { ...company };

    if (formattedCompany.corp_code) {
      formattedCompany.corp_code = String(formattedCompany.corp_code).padStart(8, '0');
    }
    if (hasStockCode(formattedCompany)) {
      formattedCompany.stock_code = formatStockCode(formattedCompany.stock_code);
    }

    return NextResponse.json(formattedCompany);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
