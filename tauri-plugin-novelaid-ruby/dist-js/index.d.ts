import { CountOptions, DetailedCountResult, StrippedResultWithMap } from './models';
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
export declare function formatRuby(surface: string, ruby: string): string;
/**
 * 全角パイプ（｜）のルビ記法を、半角パイプ（|）に正規化します。
 * 外部から読み込んだテキストや設定資料のルビ記法を半角統一する際に使用します。
 *
 * @param text 対象テキスト
 * @returns 半角パイプに統一されたテキスト
 */
export declare function normalizeRubyPipe(text: string): string;
export interface RubySnippetOptions {
    label: string;
    insertText: string;
    detail: string;
    filterText: string;
    documentation: string;
    sortText: string;
}
/**
 * Monaco Editor 補完用のルビ記法スニペット定義を生成します。
 * 入力・挿入は半角パイプ（|）で統一されます。
 *
 * @param selectedText エディタで選択中のテキスト（存在する場合）
 */
export declare function createRubySnippet(selectedText?: string): RubySnippetOptions;
export interface BoutenSnippetOptions {
    label: string;
    insertText: string;
    detail: string;
    filterText: string;
    documentation: string;
    sortText: string;
}
/**
 * Monaco Editor 補完用の傍点記法スニペット定義を生成します。
 *
 * @param selectedText エディタで選択中のテキスト（存在する場合）
 */
export declare function createBoutenSnippet(selectedText?: string): BoutenSnippetOptions;
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
export declare function formatSmartRuby(surface: string, ruby: string): string;
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
 * ルビ記法や傍点を除去し、各文字の元位置マッピング（行・列）および既存ルビ範囲情報を取得します。
 *
 * @param text 対象テキスト
 * @returns クリーンテキストと位置マッピング情報
 */
export declare function stripRubyWithMap(text: string): Promise<StrippedResultWithMap>;
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
