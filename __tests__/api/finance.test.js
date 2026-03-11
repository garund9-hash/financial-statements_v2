import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../../app/api/finance/route.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/finance');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function mockFetch(dartStatus, extraFields = {}) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ status: dartStatus, ...extraFields }),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch('000', { list: [] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── corp_code validation ─────────────────────────────────────────────────────

describe('GET /api/finance — corp_code validation', () => {
  test('returns 400 when corp_code is missing', async () => {
    const res = await GET(makeRequest({ bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid corp_code');
  });

  test('returns 400 when corp_code contains letters', async () => {
    const res = await GET(makeRequest({ corp_code: 'ABC123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid corp_code');
  });

  test('returns 400 when corp_code is more than 8 digits', async () => {
    const res = await GET(makeRequest({ corp_code: '123456789', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when corp_code has leading whitespace', async () => {
    const res = await GET(makeRequest({ corp_code: ' 123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
  });

  test('1-digit corp_code is padded to 8 digits in the forwarded URL', async () => {
    const fetcher = mockFetch('000', { list: [] });
    vi.stubGlobal('fetch', fetcher);
    await GET(makeRequest({ corp_code: '1', bsns_year: '2023', reprt_code: '11011' }));
    const calledUrl = fetcher.mock.calls[0][0];
    expect(calledUrl).toContain('corp_code=00000001');
  });

  test('8-digit corp_code is forwarded without extra padding', async () => {
    const fetcher = mockFetch('000', { list: [] });
    vi.stubGlobal('fetch', fetcher);
    await GET(makeRequest({ corp_code: '12345678', bsns_year: '2023', reprt_code: '11011' }));
    const calledUrl = fetcher.mock.calls[0][0];
    expect(calledUrl).toContain('corp_code=12345678');
  });
});

// ─── bsns_year validation ─────────────────────────────────────────────────────

describe('GET /api/finance — bsns_year validation', () => {
  test('defaults to 2023 when bsns_year is omitted', async () => {
    const fetcher = mockFetch('000', { list: [] });
    vi.stubGlobal('fetch', fetcher);
    await GET(makeRequest({ corp_code: '123', reprt_code: '11011' }));
    const calledUrl = fetcher.mock.calls[0][0];
    expect(calledUrl).toContain('bsns_year=2023');
  });

  test('returns 400 when bsns_year is not 4 digits', async () => {
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '23', reprt_code: '11011' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid year');
  });

  test('returns 400 when bsns_year contains letters', async () => {
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '202X', reprt_code: '11011' }));
    expect(res.status).toBe(400);
  });
});

// ─── reprt_code validation ────────────────────────────────────────────────────

describe('GET /api/finance — reprt_code validation', () => {
  test.each(['11011', '11012', '11013', '11014'])('accepts valid reprt_code %s', async (code) => {
    const fetcher = mockFetch('000', { list: [] });
    vi.stubGlobal('fetch', fetcher);
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: code }));
    expect(res.status).toBe(200);
  });

  test('returns 400 for an unlisted reprt_code', async () => {
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '99999' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid report code');
  });

  test('defaults to 11011 when reprt_code is omitted', async () => {
    const fetcher = mockFetch('000', { list: [] });
    vi.stubGlobal('fetch', fetcher);
    await GET(makeRequest({ corp_code: '123', bsns_year: '2023' }));
    const calledUrl = fetcher.mock.calls[0][0];
    expect(calledUrl).toContain('reprt_code=11011');
  });
});

// ─── DART error status mapping ────────────────────────────────────────────────

describe('GET /api/finance — DART error status mapping', () => {
  test.each([
    ['010', '등록되지 않은 인증키입니다.'],
    ['011', '사용할 수 없는 인증키입니다.'],
    ['020', '요청 제한을 초과하였습니다. 잠시 후 다시 시도해주세요.'],
    ['013', '해당 데이터가 없습니다.'],
    ['800', '시스템 점검 중입니다.'],
    ['900', '정의되지 않은 오류가 발생했습니다.'],
  ])('maps DART status %s to the correct Korean message', async (dartStatus, expectedMessage) => {
    vi.stubGlobal('fetch', mockFetch(dartStatus));
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(expectedMessage);
  });

  test('returns a generic Korean message for an unknown DART status', async () => {
    vi.stubGlobal('fetch', mockFetch('999'));
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('재무 데이터를 불러올 수 없습니다.');
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('GET /api/finance — happy path', () => {
  test('returns 200 with DART payload when status is 000', async () => {
    const dartPayload = { status: '000', message: 'OK', list: [{ account_nm: '자산총계', thstrm_amount: '1000000' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(dartPayload) }));
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dartPayload);
  });
});

// ─── Infrastructure failures ──────────────────────────────────────────────────

describe('GET /api/finance — infrastructure failures', () => {
  test('returns 500 when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal Server Error');
  });

  test('returns 500 when DART returns a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
    }));
    const res = await GET(makeRequest({ corp_code: '123', bsns_year: '2023', reprt_code: '11011' }));
    expect(res.status).toBe(500);
  });
});
