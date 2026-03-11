import { useState, useCallback } from 'react';

export function useAiAnalysis() {
  const [analysis, setAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const analyze = useCallback(async (companyName, chartData, year) => {
    if (!companyName || chartData.length === 0) return;

    setAiLoading(true);
    setAnalysis('');

    try {
      const analysisResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, financeData: chartData, year }),
      });
      if (!analysisResponse.ok) {
        throw new Error('AI 분석 중 오류가 발생했습니다.');
      }
      const analysisData = await analysisResponse.json();
      setAnalysis(analysisData.analysis);
    } catch (err) {
      setAnalysis(`분석 실패: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const reset = useCallback(() => setAnalysis(''), []);

  return { analysis, aiLoading, analyze, reset };
}
