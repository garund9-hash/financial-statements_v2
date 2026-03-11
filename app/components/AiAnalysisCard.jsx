import styles from '../page.module.css';

export default function AiAnalysisCard({ analysis, aiLoading, onAnalyze }) {
  return (
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
            <button className={styles.aiButton} onClick={onAnalyze}>✨ AI 분석 시작 (투자자 관점)</button>
          </div>
        )}
      </div>
    </div>
  );
}
