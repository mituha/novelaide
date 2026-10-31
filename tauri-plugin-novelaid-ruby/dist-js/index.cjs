'use strict';

var core = require('@tauri-apps/api/core');

/**
 * ルビおよび傍点に関する正規表現パターン。
 * カクヨム記法およびなろう記法に準拠したパターンを提供します。
 */
const RUBY_PATTERNS = {
    /**
     * ルビ記法 (パイプあり): `|親文字《ルビ》` または `｜親文字《ルビ》`。
     * 全角と半角の両方のパイプに対応しています。
     * - 第1グループ: 親文字
     * - 第2グループ: ルビ
     */
    RUBY_WITH_PIPE: /[|｜]([^|｜\n《》]+)《([^《》\n]+)》/g,
    /**
     * ルビ記法 (パイプなし): `漢字《ルビ》`。
     * 漢字（々、〇を含む）の連続の直後に《》が続く場合にマッチします。
     * - 第1グループ: 親文字（漢字）
     * - 第2グループ: ルビ
     */
    RUBY_WITHOUT_PIPE: /([々〇\u4e00-\u9fcf\u3400-\u4dbf]+)《([^《》\n]+)》/g,
    /**
     * 傍点（圏点）: `《《強調》》`。
     * 文字の上に打つ強調用のドットを表現するための記法です。
     * - 第1グループ: 強調対象の文字列
     */
    BOUTEN: /《《([^《》\n]+)》》/g,
    /**
     * Monaco Editor (Monarch) 用の正規表現パターン。
     * グローバルフラグ（g）を除去しており、トークナイザ定義で直接利用可能です。
     */
    MONARCH: {
        /** パイプありルビ（Monarch用） */
        RUBY_PIPE: /[|｜]([^|｜\n《》]+)《([^《》\n]+)》/,
        /** 漢字ルビ（Monarch用） */
        RUBY_KANJI: /([々〇\u4e00-\u9fcf\u3400-\u4dbf]+)《([^《》\n]+)》/,
        /** 傍点（Monarch用） */
        BOUTEN: /《《[^》]*》》/,
    },
};
/**
 * セリフ（カギ括弧）に関する正規表現パターン。
 */
const DIALOGUE_PATTERNS = {
    /**
     * セリフ（鉤括弧）: `「セリフ」`。
     * - 第1グループ: セリフの内容
     */
    DIALOGUE: /「(.*?)」/g,
    /**
     * セリフ（二重鉤括弧）: `『セリフ』`。
     * - 第1グループ: セリフの内容
     */
    DIALOGUE_DOUBLE: /『(.*?)』/g,
    /**
     * セリフ行の開始判定。
     * 行頭（または空白の後）が `「` または `『` で始まるパターン。
     */
    LINE_START: /^\s*[「『]/,
    /**
     * Monaco Editor (Monarch) 用の正規表現パターン。
     * トークンの開始と終了を個別に判定するために利用します。
     */
    MONARCH: {
        /** セリフ開始（「） */
        DIALOGUE_START: /「/,
        /** セリフ終了（」） */
        DIALOGUE_END: /」/,
        /** 二重セリフ開始（『） */
        DIALOGUE_DOUBLE_START: /『/,
        /** 二重セリフ終了（』） */
        DIALOGUE_DOUBLE_END: /』/,
    },
};
/**
 * 小説特有の記法を統合した正規表現パターン集。
 */
const NOVEL_PATTERNS = {
    /** パイプありルビ (gフラグ付き) */
    RUBY_WITH_PIPE: RUBY_PATTERNS.RUBY_WITH_PIPE,
    /** 漢字ルビ (gフラグ付き) */
    RUBY_WITHOUT_PIPE: RUBY_PATTERNS.RUBY_WITHOUT_PIPE,
    /** 傍点 (gフラグ付き) */
    BOUTEN: RUBY_PATTERNS.BOUTEN,
    /** セリフ (gフラグ付き) */
    DIALOGUE: DIALOGUE_PATTERNS.DIALOGUE,
    /** 二重セリフ (gフラグ付き) */
    DIALOGUE_DOUBLE: DIALOGUE_PATTERNS.DIALOGUE_DOUBLE,
    /**
     * 全角スペース: `\u3000`。
     */
    FULL_WIDTH_SPACE: /\u3000/g,
    /**
     * 半角スペース。
     */
    HALF_WIDTH_SPACE: / /g,
    /**
     * 改行コード。
     */
    NEWLINE: /\n/g,
    /**
     * 全角・半角スペース、タブ、改行コード。
     */
    WHITESPACE_AND_NEWLINE: /[\s\u3000]/g,
    /**
     * セリフ行の開始判定。
     */
    DIALOGUE_LINE_START: DIALOGUE_PATTERNS.LINE_START,
};
/**
 * Monaco Editor (Monarch) 用のトークナイザ定義で使いやすい形式。
 * 各機能別パターンの `MONARCH` 定義をスプレッド演算子で統合しています。
 */
const NOVEL_MONARCH_PATTERNS = {
    ...RUBY_PATTERNS.MONARCH,
    ...DIALOGUE_PATTERNS.MONARCH,
};

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
const isHiraganaChar = (c) => c >= '\u3040' && c <= '\u309F';
const isKanjiChar = (c) => (c >= '\u4E00' && c <= '\u9FFF') || c === '々' || c === '〇';
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
function formatSmartRuby(surface, ruby) {
    if (!surface || !ruby)
        return '';
    const sChars = Array.from(surface);
    const rChars = Array.from(ruby);
    if (!sChars.some(isKanjiChar)) {
        return formatRuby(surface, ruby);
    }
    // 1. 先頭の一致するひらがな（接頭辞）
    let prefixLen = 0;
    while (prefixLen < sChars.length &&
        prefixLen < rChars.length &&
        isHiraganaChar(sChars[prefixLen]) &&
        sChars[prefixLen] === rChars[prefixLen]) {
        prefixLen++;
    }
    // 2. 末尾の一致するひらがな（送り仮名）
    let sEnd = sChars.length;
    let rEnd = rChars.length;
    const suffixChars = [];
    while (sEnd > prefixLen &&
        rEnd > prefixLen &&
        isHiraganaChar(sChars[sEnd - 1]) &&
        sChars[sEnd - 1] === rChars[rEnd - 1]) {
        suffixChars.push(sChars[sEnd - 1]);
        sEnd--;
        rEnd--;
    }
    suffixChars.reverse();
    // 3. ルビ側がすでに短縮されている場合（例: surface="見下ろす", ruby="みお"）
    if (suffixChars.length === 0 && rChars.every(isHiraganaChar)) {
        let tempEnd = sEnd;
        const okuri = [];
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

exports.DIALOGUE_PATTERNS = DIALOGUE_PATTERNS;
exports.NOVEL_MONARCH_PATTERNS = NOVEL_MONARCH_PATTERNS;
exports.NOVEL_PATTERNS = NOVEL_PATTERNS;
exports.RUBY_PATTERNS = RUBY_PATTERNS;
exports.countCharacters = countCharacters;
exports.extractRubyText = extractRubyText;
exports.formatRuby = formatRuby;
exports.formatSmartRuby = formatSmartRuby;
exports.stripRuby = stripRuby;
exports.transformToHtml = transformToHtml;
