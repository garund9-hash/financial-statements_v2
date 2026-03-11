import { useState, useEffect, useRef, useCallback } from 'react';

// Allows the onClick handler on suggestion items to fire before the dropdown hides
const SUGGESTION_CLOSE_DELAY_MS = 200;
const DEBOUNCE_DELAY_MS = 300;

export function useCompanySearch() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortControllerRef = useRef(null);

  // Debounced autocomplete with AbortController to prevent race conditions
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(() => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch(`/api/company?q=${encodeURIComponent(query)}&type=suggest`, {
        signal: controller.signal,
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setSuggestions(data.suggestions || []);
            setShowSuggestions(true);
          }
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            console.error('Failed to fetch suggestions:', err);
          }
        });
    }, DEBOUNCE_DELAY_MS);

    return () => {
      clearTimeout(timer);
      abortControllerRef.current?.abort();
    };
  }, [query]);

  const selectSuggestion = useCallback((corpName) => {
    setQuery(corpName);
    setShowSuggestions(false);
  }, []);

  const handleBlur = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), SUGGESTION_CLOSE_DELAY_MS);
  }, []);

  const handleFocus = useCallback(() => {
    if (suggestions.length > 0) setShowSuggestions(true);
  }, [suggestions.length]);

  return {
    query,
    setQuery,
    suggestions,
    showSuggestions,
    selectSuggestion,
    handleBlur,
    handleFocus,
  };
}
