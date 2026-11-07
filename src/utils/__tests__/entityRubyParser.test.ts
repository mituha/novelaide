import { describe, it, expect } from 'vitest';
import { extractFirstNonEmptyLine, parseRubiesSync } from '../entityRubyParser';

describe('entityRubyParser', () => {
  describe('extractFirstNonEmptyLine', () => {
    it('ATX見出し (# ) から最初の非空行を抽出する', () => {
      const content = '\n\n# 勝魚《かつお》武市《ぶし》\n\n本文ここから';
      expect(extractFirstNonEmptyLine(content)).toBe('勝魚《かつお》武市《ぶし》');
    });

    it('複数 # 見出し (### ) から抽出する', () => {
      const content = '### 王都《おうと》ルシエラ\n説明文';
      expect(extractFirstNonEmptyLine(content)).toBe('王都《おうと》ルシエラ');
    });

    it('見出し記号のない最初の行を抽出する', () => {
      const content = '勝魚《かつお》武市《ぶし》\n==============\n本文';
      expect(extractFirstNonEmptyLine(content)).toBe('勝魚《かつお》武市《ぶし》');
    });

    it('空文字列の場合は空文字を返す', () => {
      expect(extractFirstNonEmptyLine('')).toBe('');
      expect(extractFirstNonEmptyLine('   \n\n  ')).toBe('');
    });
  });

  describe('parseRubiesSync', () => {
    it('漢字ルビ（複数）を正しく抽出する', () => {
      const text = '勝魚《かつお》武市《ぶし》';
      const result = parseRubiesSync(text);
      expect(result.cleanText).toBe('勝魚武市');
      expect(result.rubies).toEqual([
        { surface: '勝魚', ruby: 'かつお' },
        { surface: '武市', ruby: 'ぶし' },
      ]);
    });

    it('パイプありルビを正しく抽出する', () => {
      const text = '｜勝魚《かつお》｜武市《ぶし》';
      const result = parseRubiesSync(text);
      expect(result.cleanText).toBe('勝魚武市');
      expect(result.rubies).toEqual([
        { surface: '勝魚', ruby: 'かつお' },
        { surface: '武市', ruby: 'ぶし' },
      ]);
    });

    it('ルビがない場合はそのまま親文字として返す', () => {
      const text = '勝魚武市';
      const result = parseRubiesSync(text);
      expect(result.cleanText).toBe('勝魚武市');
      expect(result.rubies).toEqual([]);
    });
  });
});
