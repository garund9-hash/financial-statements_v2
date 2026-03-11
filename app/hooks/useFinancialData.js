import { useState, useCallback } from 'react';
import { extractMetrics } from '../lib/metricDefinitions';

async function fetchCompanyByName(companyName) {
  const companyResponse = await fetch(`/api/company?q=${encodeURIComponent(companyName)}`);
  if (!companyResponse.ok) {
    const errorBody = await companyResponse.json();
    throw new Error(errorBody.error || '회사를 찾을 수 없습니다. (상장사 우선 검색)');
  }
  return companyResponse.json();
}

async function fetchFinancialStatements(corpCode, year) {
  const financeResponse = await fetch(`/api/finance?corp_code=${corpCode}&bsns_year=${year}`);
  if (!financeResponse.ok) {
    const errorBody = await financeResponse.json();
    throw new Error(errorBody.error || '해당 회사의 오픈다트 재무 데이터를 불러올 수 없습니다.');
  }
  return financeResponse.json();
}

export function useFinancialData() {
  const [company, setCompany] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (companyName, year) => {
    if (!companyName.trim()) return;

    setLoading(true);
    setError('');
    setCompany(null);
    setChartData([]);

    try {
      const companyData = await fetchCompanyByName(companyName);
      setCompany(companyData);

      const financeData = await fetchFinancialStatements(companyData.corp_code, year);
      const items = financeData.list || [];
      if (items.length === 0) {
        throw new Error(`해당 회사의 ${year}년 주요 재무 데이터가 오픈다트에 없습니다.`);
      }

      setChartData(extractMetrics(items));
    } catch (err) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { company, chartData, loading, error, search };
}
