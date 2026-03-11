import { NextResponse } from 'next/server';

const CORP_CODE_RE = /^\d{1,8}$/;
const YEAR_RE = /^\d{4}$/;
// "reprt_code" is the OpenDART API's own parameter name (not a typo on our side)
// 11011 = 사업보고서 (Annual Report), 11012 = 반기보고서 (Semi-Annual)
// 11013 = 1분기보고서 (Q1), 11014 = 3분기보고서 (Q3)
const REPORT_CODE_ALLOWLIST = new Set(['11011', '11012', '11013', '11014']);

// Map OpenDART status codes to safe, user-facing messages.
// Prevents leaking internal API details (key status, rate limits, etc.)
const DART_ERROR_MESSAGES = {
  '010': '등록되지 않은 인증키입니다.',
  '011': '사용할 수 없는 인증키입니다.',
  '020': '요청 제한을 초과하였습니다. 잠시 후 다시 시도해주세요.',
  '013': '해당 데이터가 없습니다.',
  '800': '시스템 점검 중입니다.',
  '900': '정의되지 않은 오류가 발생했습니다.',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCorpCode = searchParams.get('corp_code');
    const businessYear = searchParams.get('bsns_year') || '2023';
    const reportCode = searchParams.get('reprt_code') || '11011';

    // --- Input validation (CRIT-2: prevent HTTP parameter injection) ---
    if (!rawCorpCode || !CORP_CODE_RE.test(rawCorpCode)) {
      return NextResponse.json({ error: 'Invalid corp_code' }, { status: 400 });
    }
    if (!YEAR_RE.test(businessYear)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    if (!REPORT_CODE_ALLOWLIST.has(reportCode)) {
      return NextResponse.json({ error: 'Invalid report code' }, { status: 400 });
    }

    const corpCode = rawCorpCode.padStart(8, '0');

    // CRIT-1: Use URLSearchParams to safely construct the URL.
    // Prevents parameter injection and ensures proper encoding.
    const params = new URLSearchParams({
      crtfc_key: process.env.OPENDART_API_KEY,
      corp_code: corpCode,
      bsns_year: businessYear,
      reprt_code: reportCode,
    });
    const openDartApiUrl = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?${params}`;

    const apiResponse = await fetch(openDartApiUrl);
    const apiData = await apiResponse.json();

    if (apiData.status !== '000') {
      // MED-4: Return mapped safe message instead of raw OpenDART error
      const safeMessage = DART_ERROR_MESSAGES[apiData.status] || '재무 데이터를 불러올 수 없습니다.';
      return NextResponse.json({ error: safeMessage }, { status: 400 });
    }

    return NextResponse.json(apiData);
  } catch (error) {
    // Do NOT log the full error object — it may contain the URL with the API key
    console.error('Error fetching finance data');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
