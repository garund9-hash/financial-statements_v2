import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCorpCode = searchParams.get('corp_code');
    const corpCode = rawCorpCode ? String(rawCorpCode).padStart(8, '0') : null;
    const businessYear = searchParams.get('bsns_year') || '2023';
    // "reprt_code" is the OpenDART API's own parameter name (not a typo on our side)
    // 11011 = 사업보고서 (Annual Report), 11012 = 반기보고서 (Semi-Annual Report)
    const reportCode = searchParams.get('reprt_code') || '11011';

    if (!corpCode) {
      return NextResponse.json({ error: 'Missing corp_code' }, { status: 400 });
    }

    const API_KEY = process.env.OPENDART_API_KEY;
    const openDartApiUrl = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${businessYear}&reprt_code=${reportCode}`;

    const apiResponse = await fetch(openDartApiUrl);
    const apiData = await apiResponse.json();

    if (apiData.status !== '000') {
      return NextResponse.json({ error: apiData.message || 'Failed to fetch OpenDart data' }, { status: 400 });
    }

    return NextResponse.json(apiData);
  } catch (error) {
    console.error('Error fetching finance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
