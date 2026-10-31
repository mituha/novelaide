import { useState, useEffect, useRef } from 'react';
import { countCharacters, DetailedCountResult } from 'tauri-plugin-novelaid-ruby-api';

export function useCharacterCount(
  content: string,
  selectedText: string = '',
  delay: number = 150
) {
  const [detailedMetrics, setDetailedMetrics] = useState<DetailedCountResult | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<DetailedCountResult | null>(null);

  const timerRef = useRef<number | null>(null);

  // 本文全体の文字数カウント（デバウンス + Rustバックエンド高速並行計算）
  useEffect(() => {
    let isMounted = true;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    if (!content) {
      setDetailedMetrics(null);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      countCharacters(content)
        .then((result) => {
          if (isMounted) {
            setDetailedMetrics(result);
          }
        })
        .catch((err) => {
          console.error('Failed to count characters via tauri-plugin-novelaid-ruby:', err);
        });
    }, delay);

    return () => {
      isMounted = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [content, delay]);

  // 選択テキストの文字数カウント
  useEffect(() => {
    let isMounted = true;
    if (!selectedText.trim()) {
      setSelectedMetrics(null);
      return;
    }

    countCharacters(selectedText)
      .then((result) => {
        if (isMounted) {
          setSelectedMetrics(result);
        }
      })
      .catch((err) => {
        console.error('Failed to count selected characters:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedText]);

  return {
    detailedMetrics,
    selectedMetrics,
  };
}
