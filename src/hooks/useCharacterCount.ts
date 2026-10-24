import { useState, useEffect, useRef } from 'react';
import { countCharacters, DetailedCountResult } from 'novelaid-ruby';

export function useCharacterCount(
  content: string,
  selectedText: string = '',
  delay: number = 150
) {
  const [detailedMetrics, setDetailedMetrics] = useState<DetailedCountResult | null>(() =>
    content ? countCharacters(content) : null
  );
  const [selectedMetrics, setSelectedMetrics] = useState<DetailedCountResult | null>(() =>
    selectedText ? countCharacters(selectedText) : null
  );

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setDetailedMetrics(content ? countCharacters(content) : null);
    }, delay);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [content, delay]);

  useEffect(() => {
    if (!selectedText.trim()) {
      setSelectedMetrics(null);
    } else {
      setSelectedMetrics(countCharacters(selectedText));
    }
  }, [selectedText]);

  return {
    detailedMetrics,
    selectedMetrics,
  };
}
