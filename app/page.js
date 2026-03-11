"use client";

import { useState } from 'react';
import styles from './page.module.css';
import { useCompanySearch } from './hooks/useCompanySearch';
import { useFinancialData } from './hooks/useFinancialData';
import { useAiAnalysis } from './hooks/useAiAnalysis';
import SearchForm from './components/SearchForm';
import CompanyInfo from './components/CompanyInfo';
import FinancialChart from './components/FinancialChart';
import AiAnalysisCard from './components/AiAnalysisCard';

export default function Home() {
  const [year, setYear] = useState('2023');
  const { query, setQuery, suggestions, showSuggestions, selectSuggestion, handleBlur, handleFocus } = useCompanySearch();
  const { company, chartData, loading, error, search } = useFinancialData();
  const { analysis, aiLoading, analyze, reset } = useAiAnalysis();

  const handleSearch = (e) => {
    e.preventDefault();
    reset();
    search(query, year);
  };

  const handleAiAnalyze = () => {
    analyze(company.corp_name, chartData, year);
  };

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1>EasyFinance AI</h1>
        <p>누구나 쉽게 이해할 수 있는 재무 데이터 시각화 분석 서비스</p>
      </div>

      <SearchForm
        query={query}
        setQuery={setQuery}
        year={year}
        setYear={setYear}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        selectSuggestion={selectSuggestion}
        handleBlur={handleBlur}
        handleFocus={handleFocus}
        loading={loading}
        onSubmit={handleSearch}
      />

      {error && <div className={styles.errorInfo}>{error}</div>}

      {loading && <div className={styles.loading}>데이터 수집 및 AI 분석 중입니다... 잠시만 기다려주세요.</div>}

      {!loading && company && chartData.length > 0 && (
        <>
          <CompanyInfo company={company} />
          <div className={styles.dashboard}>
            <FinancialChart chartData={chartData} year={year} />
            <AiAnalysisCard analysis={analysis} aiLoading={aiLoading} onAnalyze={handleAiAnalyze} />
          </div>
        </>
      )}
    </main>
  );
}
