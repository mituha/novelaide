import { describe, it, expect } from 'vitest';
import * as npmRuby from 'novelaid-ruby';
import { formatRuby } from '../index';

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
