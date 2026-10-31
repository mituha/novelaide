import { CountOptions, DetailedCountResult } from './models';
export * from './models';
/**
 * ルビ記法（半角パイプ統一）を組み立てます。
 * 同期処理のため、エディタ挿入時などに即時呼び出しが可能です。
 *
 * @param surface 親文字（漢字など）
 * @param ruby ルビ（ふりがな）
 * @returns `|親文字《ルビ》`
 */
export declare function formatRuby(surface: string, ruby: string): string;
/**
 * 小説記法（ルビ・傍点）をHTMLタグに変換します。
 *
 * @param text 対象テキスト
 * @returns `<ruby><rt>` および `<span class="bouten">` に置換された文字列
 */
export declare function transformToHtml(text: string): Promise<string>;
/**
 * ルビ記法や傍点を除去し、親文字のみのテキストを取得します。
 *
 * @param text 対象テキスト
 * @returns ルビ記法等が除去されたプレーンテキスト
 */
export declare function stripRuby(text: string): Promise<string>;
/**
 * ルビ読みのみをスペース区切りで抽出します。
 *
 * @param text 対象テキスト
 * @returns 抽出されたルビ文字列
 */
export declare function extractRubyText(text: string): Promise<string>;
/**
 * 詳細な文字数カウント・原稿用紙換算枚数を高速計算します。
 *
 * @param text 対象テキスト
 * @param options カウントオプション
 * @returns 詳細カウント結果
 */
export declare function countCharacters(text: string, options?: CountOptions): Promise<DetailedCountResult>;
