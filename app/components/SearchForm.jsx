'use client';

import styles from '../page.module.css';

export default function SearchForm({
  query,
  setQuery,
  year,
  setYear,
  suggestions,
  showSuggestions,
  selectSuggestion,
  handleBlur,
  handleFocus,
  loading,
  onSubmit,
}) {
  return (
    <form className={styles.searchForm} onSubmit={onSubmit}>
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
          onChange={(e) => setQuery(e.target.value)}
          onBlur={handleBlur}
          onFocus={handleFocus}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className={styles.suggestionsList}>
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                className={styles.suggestionItem}
                onClick={() => selectSuggestion(suggestion.corp_name)}
              >
                {suggestion.corp_name} {suggestion.stock_code ? <span className={styles.suggestionStock}>({suggestion.stock_code})</span> : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className={styles.searchButton} disabled={loading}>
        {loading ? '검색 중...' : '검색'}
      </button>
    </form>
  );
}
