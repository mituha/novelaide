import { invoke } from '@tauri-apps/api/core';
import { CountOptions, DetailedCountResult } from './models';

export * from './models';
export * from './patterns';

/**
 * ルビ記法（半角パイプ統一）を組み立てます。
 * 同期処理のため、エディタ挿入時などに即時呼び出しが可能です。
 *
 * @param surface 親文字（漢字など）
 * @param ruby ルビ（ふりがな）
 * @returns `|親文字《ルビ》`
 */
export function formatRuby(surface: string, ruby: string): string {
  return `|${surface}《${ruby}》`;
}

const isHiraganaChar = (c: string) => c >= '\u3040' && c <= '\u309F';
const isKanjiChar = (c: string) => (c >= '\u4E00' && c <= '\u9FFF') || c === '々' || c === '〇';

/**
 * 送り仮名（ひらがな）を自動検知して分離し、漢字部分にのみルビを振るスマート記法を生成します。
 * 本文への確定・適用段階で呼び出します。
 *
 * @example
 * formatSmartRuby('見下ろす', 'みおろす') // => '|見下《みお》ろす'
 * formatSmartRuby('見下ろす', 'みお')     // => '|見下《みお》ろす'
 * formatSmartRuby('お見舞い', 'おみまい') // => 'お|見舞《みま》い'
 * formatSmartRuby('見下ろす', 'ルックダウン') // => '|見下ろす《ルックダウン》'
 */
export function formatSmartRuby(surface: string, ruby: string): string {
  if (!surface || !ruby) return '';
  const sChars = Array.from(surface);
  const rChars = Array.from(ruby);

  if (!sChars.some(isKanjiChar)) {
    return formatRuby(surface, ruby);
  }

  // 1. 先頭の一致するひらがな（接頭辞）
  let prefixLen = 0;
  while (
    prefixLen < sChars.length &&
    prefixLen < rChars.length &&
    isHiraganaChar(sChars[prefixLen]) &&
    sChars[prefixLen] === rChars[prefixLen]
  ) {
    prefixLen++;
  }

  // 2. 末尾の一致するひらがな（送り仮名）
  let sEnd = sChars.length;
  let rEnd = rChars.length;
  const suffixChars: string[] = [];

  while (
    sEnd > prefixLen &&
    rEnd > prefixLen &&
    isHiraganaChar(sChars[sEnd - 1]) &&
    sChars[sEnd - 1] === rChars[rEnd - 1]
  ) {
    suffixChars.push(sChars[sEnd - 1]);
    sEnd--;
    rEnd--;
  }
  suffixChars.reverse();

  // 3. ルビ側がすでに短縮されている場合（例: surface="見下ろす", ruby="みお"）
  if (suffixChars.length === 0 && rChars.every(isHiraganaChar)) {
    let tempEnd = sEnd;
    const okuri: string[] = [];
    while (tempEnd > prefixLen && isHiraganaChar(sChars[tempEnd - 1])) {
      okuri.push(sChars[tempEnd - 1]);
      tempEnd--;
    }
    if (tempEnd > prefixLen && sChars.slice(prefixLen, tempEnd).some(isKanjiChar)) {
      okuri.reverse();
      suffixChars.push(...okuri);
      sEnd = tempEnd;
    }
  }

  const coreSurface = sChars.slice(prefixLen, sEnd).join('');
  const coreRuby = rChars.slice(prefixLen, rEnd).join('');

  if (coreSurface && coreRuby && Array.from(coreSurface).some(isKanjiChar)) {
    const prefix = sChars.slice(0, prefixLen).join('');
    const suffix = suffixChars.join('');
    return `${prefix}|${coreSurface}《${coreRuby}》${suffix}`;
  }

  return formatRuby(surface, ruby);
}

/**
 * 小説記法（ルビ・傍点）をHTMLタグに変換します。
 *
 * @param text 対象テキスト
 * @returns `<ruby><rt>` および `<span class="bouten">` に置換された文字列
 */
export async function transformToHtml(text: string): Promise<string> {
  return await invoke<string>('plugin:novelaid-ruby|transform_to_html', {
    text,
  });
}

/**
 * ルビ記法や傍点を除去し、親文字のみのテキストを取得します。
 *
 * @param text 対象テキスト
 * @returns ルビ記法等が除去されたプレーンテキスト
 */
export async function stripRuby(text: string): Promise<string> {
  return await invoke<string>('plugin:novelaid-ruby|strip_ruby', {
    text,
  });
}

/**
 * ルビ読みのみをスペース区切りで抽出します。
 *
 * @param text 対象テキスト
 * @returns 抽出されたルビ文字列
 */
export async function extractRubyText(text: string): Promise<string> {
  return await invoke<string>('plugin:novelaid-ruby|extract_ruby_text', {
    text,
  });
}

/**
 * 詳細な文字数カウント・原稿用紙換算枚数を高速計算します。
 *
 * @param text 対象テキスト
 * @param options カウントオプション
 * @returns 詳細カウント結果
 */
export async function countCharacters(
  text: string,
  options?: CountOptions
): Promise<DetailedCountResult> {
  return await invoke<DetailedCountResult>('plugin:novelaid-ruby|count_characters', {
    text,
    options,
  });
}
