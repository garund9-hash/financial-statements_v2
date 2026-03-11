/**
 * Strategy pattern: Configurable financial metric definitions.
 * Add new metrics here — no changes needed in components or hooks.
 */

const CFS_DIVISION_CODE = 'CFS'; // Consolidated Financial Statements (연결재무제표)

export const METRIC_DEFINITIONS = [
  { name: '매출액', keys: ['Revenue', '매출액'] },
  { name: '영업이익', keys: ['OperatingIncomeLoss', '영업이익', '영업손실'] },
  { name: '당기순이익', keys: ['ProfitLoss', '당기순이익', '당기순손실'] },
];

/**
 * Searches financial statement line items for matching accounts and returns the monetary amount.
 * Prefers Consolidated Financial Statements (CFS) over separate statements when both exist.
 */
export function findFinancialLineItemAmount(items, accountNames) {
  const matches = items.filter(item =>
    (item.account_id && accountNames.some(name => item.account_id.includes(name))) ||
    (item.account_nm && accountNames.some(name => item.account_nm.includes(name)))
  );
  if (matches.length === 0) return 0;

  const selectedItem = matches.find(match => match.fs_div === CFS_DIVISION_CODE) || matches[0];
  return Number(String(selectedItem.thstrm_amount).replace(/,/g, '')) || 0;
}

/**
 * Extracts all configured metrics from a list of financial statement line items.
 * Driven by METRIC_DEFINITIONS — add entries there to extract new metrics automatically.
 */
export function extractMetrics(financialItems) {
  return METRIC_DEFINITIONS.map(def => ({
    name: def.name,
    value: findFinancialLineItemAmount(financialItems, def.keys),
  }));
}
