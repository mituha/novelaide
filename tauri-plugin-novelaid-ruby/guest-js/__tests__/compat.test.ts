import { describe, it, expect } from 'vitest';
import * as npmRuby from 'novelaid-ruby';
import { formatRuby, formatSmartRuby } from '../index';

describe('tauri-plugin-novelaid-ruby vs npm:novelaid-ruby compatibility', () => {
  it('formatRuby should generate standard ruby syntax matching novelaid-ruby parser expectation', () => {
    const formatted = formatRuby('漢字', 'かんじ');
    expect(formatted).toBe('|漢字《かんじ》');

    // npm版の transformToHtml で正しく <ruby> に変換できることを確認
    const html = npmRuby.transformToHtml(formatted);
    expect(html).toBe('<ruby>漢字<rt>かんじ</rt></ruby>');

    // npm版の stripRuby で正しく親文字が復元されることを確認
    const stripped = npmRuby.stripRuby(formatted);
    expect(stripped).toBe('漢字');
  });

  it('formatSmartRuby should trim okurigana properly and remain valid in npm:novelaid-ruby', () => {
    // 1. 動詞の送り仮名分離
    const res1 = formatSmartRuby('見下ろす', 'みおろす');
    expect(res1).toBe('|見下《みお》ろす');
    expect(npmRuby.transformToHtml(res1)).toBe('<ruby>見下<rt>みお</rt></ruby>ろす');
    expect(npmRuby.stripRuby(res1)).toBe('見下ろす');

    // 2. 作家が手入力でルビを短縮した場合
    const res2 = formatSmartRuby('見下ろす', 'みお');
    expect(res2).toBe('|見下《みお》ろす');

    // 3. 接頭辞付き
    const res3 = formatSmartRuby('お見舞い', 'おみまい');
    expect(res3).toBe('お|見舞《みま》い');
    expect(npmRuby.transformToHtml(res3)).toBe('お<ruby>見舞<rt>みま</rt></ruby>い');

    // 4. 当て字（カタカナ）は全体ルビ維持
    const res4 = formatSmartRuby('見下ろす', 'ルックダウン');
    expect(res4).toBe('|見下ろす《ルックダウン》');
    expect(npmRuby.transformToHtml(res4)).toBe('<ruby>見下ろす<rt>ルックダウン</rt></ruby>');

    // 5. 漢字のみ熟語
    const res5 = formatSmartRuby('天霧', 'あまぎり');
    expect(res5).toBe('|天霧《あまぎり》');
  });

  it('formatRuby with multiple words and mixed ruby patterns in npm:novelaid-ruby', () => {
    const r1 = formatRuby('運命', 'デスティニー');
    const r2 = formatRuby('鍵', 'キー');
    const sentence = `${r1}の${r2}を手にした。`;

    expect(sentence).toBe('|運命《デスティニー》の|鍵《キー》を手にした。');
    expect(npmRuby.transformToHtml(sentence)).toBe(
      '<ruby>運命<rt>デスティニー</rt></ruby>の<ruby>鍵<rt>キー</rt></ruby>を手にした。'
    );
    expect(npmRuby.stripRuby(sentence)).toBe('運命の鍵を手にした。');
    expect(npmRuby.extractRubyText(sentence)).toBe('デスティニー キー');
  });

  it('npm novelaid-ruby export consistency', () => {
    // npm版のコア関数が存在することを確認
    expect(typeof npmRuby.transformToHtml).toBe('function');
    expect(typeof npmRuby.stripRuby).toBe('function');
    expect(typeof npmRuby.countCharacters).toBe('function');
    expect(typeof npmRuby.extractRubyText).toBe('function');
  });
});
