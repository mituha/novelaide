'use strict';

var core = require('@tauri-apps/api/core');

/**
 * ルビ記法（半角パイプ統一）を組み立てます。
 * 同期処理のため、エディタ挿入時などに即時呼び出しが可能です。
 *
 * @param surface 親文字（漢字など）
 * @param ruby ルビ（ふりがな）
 * @returns `|親文字《ルビ》`
 */
function formatRuby(surface, ruby) {
    return `|${surface}《${ruby}》`;
}
/**
 * 小説記法（ルビ・傍点）をHTMLタグに変換します。
 *
 * @param text 対象テキスト
 * @returns `<ruby><rt>` および `<span class="bouten">` に置換された文字列
 */
async function transformToHtml(text) {
    return await core.invoke('plugin:novelaid-ruby|transform_to_html', {
        text,
    });
}
/**
 * ルビ記法や傍点を除去し、親文字のみのテキストを取得します。
 *
 * @param text 対象テキスト
 * @returns ルビ記法等が除去されたプレーンテキスト
 */
async function stripRuby(text) {
    return await core.invoke('plugin:novelaid-ruby|strip_ruby', {
        text,
    });
}
/**
 * ルビ読みのみをスペース区切りで抽出します。
 *
 * @param text 対象テキスト
 * @returns 抽出されたルビ文字列
 */
async function extractRubyText(text) {
    return await core.invoke('plugin:novelaid-ruby|extract_ruby_text', {
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
async function countCharacters(text, options) {
    return await core.invoke('plugin:novelaid-ruby|count_characters', {
        text,
        options,
    });
}

exports.countCharacters = countCharacters;
exports.extractRubyText = extractRubyText;
exports.formatRuby = formatRuby;
exports.stripRuby = stripRuby;
exports.transformToHtml = transformToHtml;
