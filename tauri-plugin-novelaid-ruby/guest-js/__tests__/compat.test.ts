import { describe, it, expect } from 'vitest';
import { formatRuby, formatSmartRuby, NOVEL_PATTERNS, NOVEL_MONARCH_PATTERNS } from '../index';

describe('tauri-plugin-novelaid-ruby guest-js tests', () => {
  it('formatRuby should generate standard ruby syntax', () => {
    const formatted = formatRuby('漢字', 'かんじ');
    expect(formatted).toBe('|漢字《かんじ》');
  });

  it('formatSmartRuby should trim okurigana properly and handle various patterns', () => {
    // 1. 動詞の送り仮名分離
    const res1 = formatSmartRuby('見下ろす', 'みおろす');
    expect(res1).toBe('|見下《みお》ろす');

    // 2. 作家が手入力でルビを短縮した場合
    const res2 = formatSmartRuby('見下ろす', 'みお');
    expect(res2).toBe('|見下《みお》ろす');

    // 3. 接頭辞付き
    const res3 = formatSmartRuby('お見舞い', 'おみまい');
    expect(res3).toBe('お|見舞《みま》い');

    // 4. 当て字（カタカナ）は全体ルビ維持
    const res4 = formatSmartRuby('見下ろす', 'ルックダウン');
    expect(res4).toBe('|見下ろす《ルックダウン》');

    // 5. 漢字のみ熟語
    const res5 = formatSmartRuby('天霧', 'あまぎり');
    expect(res5).toBe('|天霧《あまぎり》');
  });

  it('formatRuby with multiple words in sentence', () => {
    const r1 = formatRuby('運命', 'デスティニー');
    const r2 = formatRuby('鍵', 'キー');
    const sentence = `${r1}の${r2}を手にした。`;

    expect(sentence).toBe('|運命《デスティニー》の|鍵《キー》を手にした。');
  });

  it('exports valid regex patterns for editor', () => {
    expect(NOVEL_PATTERNS.RUBY_WITH_PIPE).toBeInstanceOf(RegExp);
    expect(NOVEL_PATTERNS.BOUTEN).toBeInstanceOf(RegExp);
    expect(NOVEL_PATTERNS.FULL_WIDTH_SPACE).toBeInstanceOf(RegExp);
    expect(NOVEL_MONARCH_PATTERNS.DIALOGUE_START).toBeInstanceOf(RegExp);
    expect(NOVEL_MONARCH_PATTERNS.DIALOGUE_END).toBeInstanceOf(RegExp);
  });
});
