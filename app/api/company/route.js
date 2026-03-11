import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

let cachedList = null;

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
      for (const c of list) {
         if (String(c.corp_name).toLowerCase().startsWith(lowerQuery)) {
            matches.push({ corp_name: c.corp_name, stock_code: c.stock_code ? String(c.stock_code).trim().padStart(6, '0') : '' });
         }
         if (matches.length >= 10) break;
      }
      return NextResponse.json({ suggestions: matches });
    }
    
    // First try to find exact match with a stock code
    let company = list.find(c => c.corp_name === query && c.stock_code && String(c.stock_code).trim() !== '');
    
    if (!company) {
       // Exact match regardless of stock code
       company = list.find(c => c.corp_name === query);
    }

    if (!company) {
       // Fuzzy match
       company = list.find(c => String(c.corp_name).includes(query) && c.stock_code && String(c.stock_code).trim() !== '');
    }

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // clone to prevent mutating global cache
    const companyCopy = { ...company };

    if (companyCopy.corp_code) {
      companyCopy.corp_code = String(companyCopy.corp_code).padStart(8, '0');
    }
    if (companyCopy.stock_code && String(companyCopy.stock_code).trim() !== '') {
      companyCopy.stock_code = String(companyCopy.stock_code).trim().padStart(6, '0');
    }

    return NextResponse.json(companyCopy);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
