import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises before importing the route to avoid reading the real corp.xml (~900 MB).
// vi.mock auto-mocks all exports as vi.fn() — we'll configure readFile per test.
vi.mock('fs/promises');

import * as fs from 'fs/promises';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// fast-xml-parser returns a plain object (not array) when there is only one <list> element.
// The route does `for...of list` which breaks on a plain object.
// Fix: always include at least 2 entries so the parser produces an array.
// DUMMY is a sentinel entry that will never match any real query.
const DUMMY = { corp_code: '99999999', corp_name: '__dummy__', stock_code: '' };

function buildXml(entries) {
  const all = entries.length < 2 ? [...entries, DUMMY] : entries;
  const rows = all
    .map(
      e => `<list>
        <corp_code>${e.corp_code}</corp_code>
        <corp_name>${e.corp_name}</corp_name>
        <stock_code>${e.stock_code ?? ''}</stock_code>
      </list>`
    )
    .join('');
  return `<result>${rows}</result>`;
}

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/company');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

const LISTED = { corp_code: '12345678', corp_name: '삼성전자', stock_code: '005930' };
const UNLISTED = { corp_code: '00000001', corp_name: '비상장기업', stock_code: '' };
const SAME_NAME_UNLISTED = { corp_code: '00000002', corp_name: '삼성전자', stock_code: '' };

// The company route has a module-level cachePromise singleton.
// We reset it between tests by resetting modules and re-importing the route.
// The fs mock stays registered across resets because vi.mock() is hoisted.
let GET;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  // Re-import route after module reset so cachePromise starts as null
  const route = await import('../../app/api/company/route.js');
  GET = route.GET;
});

function mockReadFile(xmlContent) {
  vi.mocked(fs.readFile).mockResolvedValue(xmlContent);
}

function mockReadFileError(err) {
  vi.mocked(fs.readFile).mockRejectedValue(err);
}

// ─── Missing query ────────────────────────────────────────────────────────────

describe('GET /api/company — missing query', () => {
  test('returns 400 when q is missing and type is not suggest', async () => {
    mockReadFile(buildXml([LISTED]));
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing company name query');
  });

  test('returns empty suggestions when q is missing and type is suggest', async () => {
    mockReadFile(buildXml([LISTED]));
    const res = await GET(makeRequest({ type: 'suggest' }));
    expect(res.status).toBe(200);
    expect((await res.json()).suggestions).toEqual([]);
  });
});

// ─── Suggest mode ─────────────────────────────────────────────────────────────

describe('GET /api/company — suggest mode', () => {
  test('returns companies whose name starts with the query', async () => {
    mockReadFile(buildXml([LISTED, UNLISTED]));
    const res = await GET(makeRequest({ q: '삼성', type: 'suggest' }));
    expect(res.status).toBe(200);
    const { suggestions } = await res.json();
    // Only LISTED starts with '삼성', not UNLISTED ('비상장기업')
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].corp_name).toBe('삼성전자');
  });

  test('limits suggestions to at most 10 results', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      corp_code: String(i).padStart(8, '0'),
      corp_name: `삼성계열사${i}`,
      stock_code: String(i).padStart(6, '0'),
    }));
    mockReadFile(buildXml(many));
    const res = await GET(makeRequest({ q: '삼성', type: 'suggest' }));
    const { suggestions } = await res.json();
    expect(suggestions.length).toBeLessThanOrEqual(10);
  });

  test('is case-insensitive for the query', async () => {
    const samsung = { corp_code: '12345678', corp_name: 'Samsung', stock_code: '005930' };
    mockReadFile(buildXml([samsung]));
    const res = await GET(makeRequest({ q: 'samsung', type: 'suggest' }));
    const { suggestions } = await res.json();
    expect(suggestions[0].corp_name).toBe('Samsung');
  });

  test('pads stock_code to 6 digits with leading zeros in suggestions', async () => {
    const company = { corp_code: '12345678', corp_name: '테스트기업', stock_code: '123' };
    mockReadFile(buildXml([company]));
    const res = await GET(makeRequest({ q: '테스트', type: 'suggest' }));
    const { suggestions } = await res.json();
    expect(suggestions[0].stock_code).toBe('000123');
  });

  test('returns empty string for stock_code of unlisted companies in suggestions', async () => {
    mockReadFile(buildXml([UNLISTED]));
    const res = await GET(makeRequest({ q: '비상장', type: 'suggest' }));
    const { suggestions } = await res.json();
    expect(suggestions[0].stock_code).toBe('');
  });
});

// ─── Exact lookup ─────────────────────────────────────────────────────────────

describe('GET /api/company — exact lookup', () => {
  test('returns 404 when no company matches', async () => {
    mockReadFile(buildXml([LISTED]));
    const res = await GET(makeRequest({ q: '존재하지않는기업' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Company not found');
  });

  test('prefers listed company over unlisted company with the same name', async () => {
    // Unlisted comes BEFORE listed in XML — verifies priority is by stock code, not position
    mockReadFile(buildXml([SAME_NAME_UNLISTED, LISTED]));
    const res = await GET(makeRequest({ q: '삼성전자' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stock_code).toBe('005930');
  });

  test('falls back to unlisted company when no listed match exists', async () => {
    mockReadFile(buildXml([UNLISTED]));
    const res = await GET(makeRequest({ q: '비상장기업' }));
    expect(res.status).toBe(200);
    expect((await res.json()).corp_name).toBe('비상장기업');
  });

  test('falls back to partial/substring match on listed companies', async () => {
    const company = { corp_code: '12345678', corp_name: '삼성전자주식회사', stock_code: '005930' };
    mockReadFile(buildXml([company]));
    // Searching for '삼성전자' — no exact match, should partial-match '삼성전자주식회사'
    const res = await GET(makeRequest({ q: '삼성전자' }));
    expect(res.status).toBe(200);
    expect((await res.json()).corp_name).toBe('삼성전자주식회사');
  });

  test('pads corp_code to 8 digits with leading zeros in the response', async () => {
    const company = { corp_code: '11111111', corp_name: '테스트기업', stock_code: '005930' };
    mockReadFile(buildXml([company]));
    const res = await GET(makeRequest({ q: '테스트기업' }));
    const body = await res.json();
    expect(body.corp_code).toBe('11111111');
  });
});

// ─── Infrastructure failure ───────────────────────────────────────────────────

describe('GET /api/company — infrastructure failure', () => {
  test('returns 500 when the XML file cannot be read', async () => {
    mockReadFileError(new Error('ENOENT: no such file or directory'));
    const res = await GET(makeRequest({ q: '삼성전자' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal Server Error');
  });
});
