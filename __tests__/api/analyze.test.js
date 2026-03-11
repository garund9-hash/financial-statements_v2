import { describe, test, expect, vi, beforeEach } from 'vitest';

// mockCreate must be hoisted so the vi.mock factory can reference it.
// vi.hoisted runs before module imports, making the variable available in the factory.
const mockCreate = vi.hoisted(() => vi.fn());

// Mock the OpenAI module — the client is instantiated at module scope in route.js,
// so we must intercept before the module loads.
// We need a real class (constructor) because route.js calls `new OpenAI(...)`.
vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor() {
      this.chat = { completions: { create: mockCreate } };
    }
  },
}));

import { POST } from '../../app/api/analyze/route.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body) {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_FINANCE_DATA = [
  { name: '매출액', value: 1000000 },
  { name: '영업이익', value: 200000 },
];

const VALID_BODY = {
  companyName: '삼성전자',
  financeData: VALID_FINANCE_DATA,
  year: '2023',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ choices: [{ message: { content: '분석 결과입니다.' } }] });
});

// ─── companyName validation ───────────────────────────────────────────────────

describe('POST /api/analyze — companyName validation', () => {
  test('returns 400 when companyName is missing', async () => {
    const res = await POST(makeRequest({ financeData: VALID_FINANCE_DATA, year: '2023' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing company name');
  });

  test('returns 400 when companyName is a number, not a string', async () => {
    const res = await POST(makeRequest({ companyName: 123, financeData: VALID_FINANCE_DATA }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing company name');
  });

  test('returns 400 when companyName exceeds 100 characters', async () => {
    const res = await POST(makeRequest({ companyName: '삼'.repeat(101), financeData: VALID_FINANCE_DATA }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Company name too long');
  });

  test('accepts a companyName of exactly 100 characters', async () => {
    const res = await POST(makeRequest({ companyName: '삼'.repeat(100), financeData: VALID_FINANCE_DATA, year: '2023' }));
    expect(res.status).toBe(200);
  });

  test('returns 400 for a companyName with disallowed characters like <script>', async () => {
    const res = await POST(makeRequest({ companyName: '<script>', financeData: VALID_FINANCE_DATA }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid company name');
  });

  // Documents known gap: whitespace-only names currently pass validation
  test('KNOWN GAP: whitespace-only companyName currently passes validation', async () => {
    const res = await POST(makeRequest({ companyName: '   ', financeData: VALID_FINANCE_DATA, year: '2023' }));
    // This returns 200 today — a .trim().length > 0 guard would fix it
    expect(res.status).toBe(200);
  });
});

// ─── financeData validation ───────────────────────────────────────────────────

describe('POST /api/analyze — financeData validation', () => {
  test('returns 400 when financeData is null', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: null }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid finance data format');
  });

  test('returns 400 when financeData is an empty array', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [] }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when financeData has more than 10 items', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ name: `항목${i}`, value: i }));
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: tooMany }));
    expect(res.status).toBe(400);
  });

  test('accepts financeData with exactly 10 items', async () => {
    const tenItems = Array.from({ length: 10 }, (_, i) => ({ name: `항목${i}`, value: i * 1000 }));
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: tenItems, year: '2023' }));
    expect(res.status).toBe(200);
  });

  test('returns 400 when an item has Infinity as value', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [{ name: '매출액', value: Infinity }] }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when an item has NaN as value', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [{ name: '매출액', value: NaN }] }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when an item has a string-encoded number as value', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [{ name: '매출액', value: '1000000' }] }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when an item name exceeds 50 characters', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [{ name: '항'.repeat(51), value: 100 }] }));
    expect(res.status).toBe(400);
  });

  test('accepts an item name of exactly 50 characters', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [{ name: '항'.repeat(50), value: 100 }], year: '2023' }));
    expect(res.status).toBe(200);
  });

  test('returns 400 when a null item is present in the array', async () => {
    const res = await POST(makeRequest({ companyName: '삼성전자', financeData: [null] }));
    expect(res.status).toBe(400);
  });
});

// ─── year validation ──────────────────────────────────────────────────────────

describe('POST /api/analyze — year validation', () => {
  test('returns 400 when year is provided but not 4 digits', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, year: '23' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid year');
  });

  test('succeeds when year is omitted (optional field)', async () => {
    const { year: _omitted, ...bodyWithoutYear } = VALID_BODY;
    const res = await POST(makeRequest(bodyWithoutYear));
    expect(res.status).toBe(200);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('POST /api/analyze — happy path', () => {
  test('returns 200 with analysis content from OpenAI', async () => {
    const expectedAnalysis = '삼성전자의 재무 상태는 양호합니다.';
    mockCreate.mockResolvedValue({ choices: [{ message: { content: expectedAnalysis } }] });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).analysis).toBe(expectedAnalysis);
  });
});

// ─── OpenAI failures ──────────────────────────────────────────────────────────

describe('POST /api/analyze — OpenAI failures', () => {
  test('returns 500 when OpenAI throws a network error', async () => {
    mockCreate.mockRejectedValue(new Error('Network Error'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal Server Error');
  });

  // Documents known gap: choices[0] access without a length guard
  test('KNOWN GAP: returns 500 when OpenAI returns empty choices array', async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    const res = await POST(makeRequest(VALID_BODY));
    // choices[0] is undefined → TypeError → caught as 500
    expect(res.status).toBe(500);
  });
});
