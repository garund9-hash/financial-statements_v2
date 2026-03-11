import { describe, test, expect } from 'vitest';
import {
  METRIC_DEFINITIONS,
  findFinancialLineItemAmount,
  extractMetrics,
} from '../../app/lib/metricDefinitions.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(account_nm, amount, { account_id = '', fs_div = 'OFS' } = {}) {
  return { account_nm, account_id, thstrm_amount: String(amount), fs_div };
}

// ─── METRIC_DEFINITIONS ──────────────────────────────────────────────────────

describe('METRIC_DEFINITIONS', () => {
  test('contains exactly 3 metric definitions', () => {
    expect(METRIC_DEFINITIONS).toHaveLength(3);
  });

  test('each definition has a non-empty name and keys array', () => {
    for (const def of METRIC_DEFINITIONS) {
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(Array.isArray(def.keys)).toBe(true);
      expect(def.keys.length).toBeGreaterThan(0);
    }
  });

  test('includes 매출액, 영업이익, and 당기순이익', () => {
    const names = METRIC_DEFINITIONS.map(d => d.name);
    expect(names).toContain('매출액');
    expect(names).toContain('영업이익');
    expect(names).toContain('당기순이익');
  });
});

// ─── findFinancialLineItemAmount ──────────────────────────────────────────────

describe('findFinancialLineItemAmount', () => {
  test('returns 0 for empty items array', () => {
    expect(findFinancialLineItemAmount([], ['매출액'])).toBe(0);
  });

  test('returns 0 when no account key matches', () => {
    const items = [makeItem('자산총계', 9999999)];
    expect(findFinancialLineItemAmount(items, ['매출액', 'Revenue'])).toBe(0);
  });

  test('matches via account_nm (Korean key)', () => {
    const items = [makeItem('매출액', 5000000)];
    expect(findFinancialLineItemAmount(items, ['매출액'])).toBe(5000000);
  });

  test('matches via account_id (English key)', () => {
    const items = [makeItem('수익', 9000000, { account_id: 'Revenue' })];
    expect(findFinancialLineItemAmount(items, ['Revenue'])).toBe(9000000);
  });

  test('prefers CFS record over non-CFS when both exist', () => {
    const items = [
      makeItem('매출액', 1000000, { fs_div: 'OFS' }),
      makeItem('매출액', 9000000, { fs_div: 'CFS' }),
    ];
    expect(findFinancialLineItemAmount(items, ['매출액'])).toBe(9000000);
  });

  test('falls back to first match when no CFS record', () => {
    const items = [
      makeItem('매출액', 1111111, { fs_div: 'OFS' }),
      makeItem('매출액', 2222222, { fs_div: 'OFS' }),
    ];
    expect(findFinancialLineItemAmount(items, ['매출액'])).toBe(1111111);
  });

  test('parses comma-separated amount string correctly', () => {
    const items = [makeItem('매출액', '1,234,567')];
    expect(findFinancialLineItemAmount(items, ['매출액'])).toBe(1234567);
  });

  test('returns 0 for amount "0" — not treated as missing', () => {
    const items = [makeItem('영업이익', '0')];
    expect(findFinancialLineItemAmount(items, ['영업이익'])).toBe(0);
  });

  test('handles negative amount string', () => {
    const items = [makeItem('영업손실', '-200,000')];
    expect(findFinancialLineItemAmount(items, ['영업손실'])).toBe(-200000);
  });

  test('handles Number.MAX_SAFE_INTEGER without overflow', () => {
    const items = [makeItem('매출액', String(Number.MAX_SAFE_INTEGER))];
    expect(findFinancialLineItemAmount(items, ['매출액'])).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ─── extractMetrics ───────────────────────────────────────────────────────────

describe('extractMetrics', () => {
  test('always returns array of length 3', () => {
    expect(extractMetrics([])).toHaveLength(3);
  });

  test('result names match METRIC_DEFINITIONS order', () => {
    const names = extractMetrics([]).map(m => m.name);
    expect(names).toEqual(['매출액', '영업이익', '당기순이익']);
  });

  test('all values are 0 when no matching items', () => {
    const result = extractMetrics([]);
    for (const m of result) {
      expect(m.value).toBe(0);
    }
  });

  test('extracts all three metrics when all are present', () => {
    const items = [
      makeItem('매출액', '5,000,000', { fs_div: 'CFS' }),
      makeItem('영업이익', '800,000', { fs_div: 'CFS' }),
      makeItem('당기순이익', '600,000', { fs_div: 'CFS' }),
    ];
    const result = extractMetrics(items);
    expect(result.find(m => m.name === '매출액').value).toBe(5000000);
    expect(result.find(m => m.name === '영업이익').value).toBe(800000);
    expect(result.find(m => m.name === '당기순이익').value).toBe(600000);
  });

  test('each result item has name and value properties', () => {
    const result = extractMetrics([]);
    for (const m of result) {
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('value');
    }
  });
});
