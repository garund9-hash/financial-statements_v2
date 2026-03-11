import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw_corp_code = searchParams.get('corp_code');
    const corp_code = raw_corp_code ? String(raw_corp_code).padStart(8, '0') : null;
    const bsns_year = searchParams.get('bsns_year') || '2023';
    const reprt_code = searchParams.get('reprt_code') || '11011'; // 11011 = 사업보고서, 11012 = 반기보고서

    if (!corp_code) {
      return NextResponse.json({ error: 'Missing corp_code' }, { status: 400 });
    }

    const API_KEY = process.env.OPENDART_API_KEY;
    const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corp_code}&bsns_year=${bsns_year}&reprt_code=${reprt_code}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== '000') {
      return NextResponse.json({ error: data.message || 'Failed to fetch OpenDart data' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching finance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
