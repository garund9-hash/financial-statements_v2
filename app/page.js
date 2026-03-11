"use client";

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import styles from './page.module.css';

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [year, setYear] = useState('2023');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [analysis, setAnalysis] = useState('');

  const handleQueryChange = async (e) => {
    const val = e.target.value;
    setQuery(val);
    
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const res = await fetch(`/api/company?q=${encodeURIComponent(val)}&type=suggest`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setCompany(null);
    setChartData([]);
    setAnalysis('');

    try {
      // 1. Get Company Corp Code
      const compRes = await fetch(`/api/company?q=${encodeURIComponent(query)}`);
      if (!compRes.ok) {
        const d = await compRes.json();
        throw new Error(d.error || '회사를 찾을 수 없습니다. (상장사 우선 검색)');
      }
      const compData = await compRes.json();
      setCompany(compData);

      // 2. Fetch Finance Data
      const finRes = await fetch(`/api/finance?corp_code=${compData.corp_code}&bsns_year=${year}`);
      if (!finRes.ok) {
        const d = await finRes.json();
        throw new Error(d.error || '해당 회사의 오픈다트 재무 데이터를 불러올 수 없습니다.');
      }
      const finData = await finRes.json();

      const list = finData.list || [];
      if (list.length === 0) throw new Error(`해당 회사의 ${year}년 주요 재무 데이터가 오픈다트에 없습니다.`);

      const findAmount = (accountNames) => {
        const matches = list.filter(i => 
          (i.account_id && accountNames.some(name => i.account_id.includes(name))) || 
          (i.account_nm && accountNames.some(name => i.account_nm.includes(name)))
        );
        if (matches.length === 0) return 0;

        // Prefer Consolidated Financial Statements (CFS) if available
        const item = matches.find(m => m.fs_div === 'CFS') || matches[0];
        return Number(String(item.thstrm_amount).replace(/,/g, '')) || 0;
      };

      const revenue = findAmount(['Revenue', '매출액']);
      const opIncome = findAmount(['OperatingIncomeLoss', '영업이익', '영업손실']);
      const netIncome = findAmount(['ProfitLoss', '당기순이익', '당기순손실']);

      const parsedChartData = [
        { name: '매출액', value: revenue },
        { name: '영업이익', value: opIncome },
        { name: '당기순이익', value: netIncome },
      ];
      setChartData(parsedChartData);

    } catch (err) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!company || chartData.length === 0) return;
    setAiLoading(true);
    setAnalysis('');
    
    try {
      const aiRes = await fetch(`/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: company.corp_name, financeData: chartData, year }),
      });
      if (!aiRes.ok) {
        throw new Error('AI 분석 중 오류가 발생했습니다.');
      }
      const aiData = await aiRes.json();
      setAnalysis(aiData.analysis);
    } catch (err) {
      setAnalysis(`분석 실패: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const formatCurrency = (value) => {
    // Convert to 100 million KRW (억원) for better readability
    const inEok = value / 100000000;
    return new Intl.NumberFormat('ko-KR', {
      maximumFractionDigits: 0,
    }).format(inEok) + '억';
  };

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1>EasyFinance AI</h1>
        <p>누구나 쉽게 이해할 수 있는 재무 데이터 시각화 분석 서비스</p>
      </div>

      <form className={styles.searchForm} onSubmit={handleSearch}>
        <select
          className={styles.yearSelect}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="2024">2024년</option>
          <option value="2023">2023년</option>
          <option value="2022">2022년</option>
          <option value="2021">2021년</option>
          <option value="2020">2020년</option>
        </select>
        <div className={styles.searchWrapper}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="회사명 검색 (예: 삼성전자)"
            value={query}
            onChange={handleQueryChange}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className={styles.suggestionsList}>
              {suggestions.map((s, i) => (
                <li 
                  key={i} 
                  className={styles.suggestionItem}
                  onClick={() => {
                     setQuery(s.corp_name);
                     setShowSuggestions(false);
                  }}
                >
                  {s.corp_name} {s.stock_code ? <span className={styles.suggestionStock}>({s.stock_code})</span> : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className={styles.searchButton} disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {error && <div className={styles.errorInfo}>{error}</div>}

      {loading && <div className={styles.loading}>데이터 수집 및 AI 분석 중입니다... 잠시만 기다려주세요.</div>}

      {!loading && company && chartData.length > 0 && (
        <>
          <div className={styles.companyInfo}>
            <h2>{company.corp_name}</h2>
            <p>고유코드: {company.corp_code} {company.stock_code ? `| 종목코드: ${company.stock_code}` : ''}</p>
          </div>
          
          <div className={styles.dashboard}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>📊 주요 재무 지표 ({year}년)</h3>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{fill: 'var(--foreground)', fontSize: 13, fontWeight: 600}} axisLine={{stroke: 'var(--border)'}} tickLine={false} />
                    <YAxis tickFormatter={formatCurrency} tick={{fill: 'var(--foreground)', fontSize: 13}} width={80} axisLine={false} tickLine={false} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      cursor={{fill: 'rgba(0,0,0,0.05)'}}
                      contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderRadius: '12px', color: 'var(--foreground)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      itemStyle={{ color: '#ffffff', fontWeight: 600 }}
                      labelStyle={{ color: 'var(--secondary)' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {
                        chartData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.value < 0 ? 'var(--error)' : 'var(--primary)'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>✨ AI 재무 분석 리포트</h3>
              <div className={styles.summaryText}>
                {aiLoading ? (
                  <div className={styles.loadingAi}>✨ 투자자 관점에서 데이터를 심층 분석 중입니다...</div>
                ) : analysis ? (
                  analysis
                ) : (
                  <div className={styles.aiPromptContainer}>
                    <p>💡 재무 데이터를 모두 확인했다면, 투자 결정에 도움이 되는 AI 심층 분석을 받아보세요.</p>
                    <button className={styles.aiButton} onClick={handleAiAnalyze}>✨ AI 분석 시작 (투자자 관점)</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
