/**
 * ルビおよび傍点に関する正規表現パターン。
 * カクヨム記法およびなろう記法に準拠したパターンを提供します。
 */
export declare const RUBY_PATTERNS: {
    /**
     * ルビ記法 (パイプあり): `|親文字《ルビ》` または `｜親文字《ルビ》`。
     * 全角と半角の両方のパイプに対応しています。
     * - 第1グループ: 親文字
     * - 第2グループ: ルビ
     */
    RUBY_WITH_PIPE: RegExp;
    /**
     * ルビ記法 (パイプなし): `漢字《ルビ》`。
     * 漢字（々、〇を含む）の連続の直後に《》が続く場合にマッチします。
     * - 第1グループ: 親文字（漢字）
     * - 第2グループ: ルビ
     */
    RUBY_WITHOUT_PIPE: RegExp;
    /**
     * 傍点（圏点）: `《《強調》》`。
     * 文字の上に打つ強調用のドットを表現するための記法です。
     * - 第1グループ: 強調対象の文字列
     */
    BOUTEN: RegExp;
    /**
     * Monaco Editor (Monarch) 用の正規表現パターン。
     * グローバルフラグ（g）を除去しており、トークナイザ定義で直接利用可能です。
     */
    MONARCH: {
        /** パイプありルビ（Monarch用） */
        RUBY_PIPE: RegExp;
        /** 漢字ルビ（Monarch用） */
        RUBY_KANJI: RegExp;
        /** 傍点（Monarch用） */
        BOUTEN: RegExp;
    };
};
/**
 * セリフ（カギ括弧）に関する正規表現パターン。
 */
export declare const DIALOGUE_PATTERNS: {
    /**
     * セリフ（鉤括弧）: `「セリフ」`。
     * - 第1グループ: セリフの内容
     */
    DIALOGUE: RegExp;
    /**
     * セリフ（二重鉤括弧）: `『セリフ』`。
     * - 第1グループ: セリフの内容
     */
    DIALOGUE_DOUBLE: RegExp;
    /**
     * セリフ行の開始判定。
     * 行頭（または空白の後）が `「` または `『` で始まるパターン。
     */
    LINE_START: RegExp;
    /**
     * Monaco Editor (Monarch) 用の正規表現パターン。
     * トークンの開始と終了を個別に判定するために利用します。
     */
    MONARCH: {
        /** セリフ開始（「） */
        DIALOGUE_START: RegExp;
        /** セリフ終了（」） */
        DIALOGUE_END: RegExp;
        /** 二重セリフ開始（『） */
        DIALOGUE_DOUBLE_START: RegExp;
        /** 二重セリフ終了（』） */
        DIALOGUE_DOUBLE_END: RegExp;
    };
};
/**
 * 小説特有の記法を統合した正規表現パターン集。
 */
export declare const NOVEL_PATTERNS: {
    /** パイプありルビ (gフラグ付き) */
    RUBY_WITH_PIPE: RegExp;
    /** 漢字ルビ (gフラグ付き) */
    RUBY_WITHOUT_PIPE: RegExp;
    /** 傍点 (gフラグ付き) */
    BOUTEN: RegExp;
    /** セリフ (gフラグ付き) */
    DIALOGUE: RegExp;
    /** 二重セリフ (gフラグ付き) */
    DIALOGUE_DOUBLE: RegExp;
    /**
     * 全角スペース: `\u3000`。
     */
    FULL_WIDTH_SPACE: RegExp;
    /**
     * 半角スペース。
     */
    HALF_WIDTH_SPACE: RegExp;
    /**
     * 改行コード。
     */
    NEWLINE: RegExp;
    /**
     * 全角・半角スペース、タブ、改行コード。
     */
    WHITESPACE_AND_NEWLINE: RegExp;
    /**
     * セリフ行の開始判定。
     */
    DIALOGUE_LINE_START: RegExp;
};
/**
 * Monaco Editor (Monarch) 用のトークナイザ定義で使いやすい形式。
 * 各機能別パターンの `MONARCH` 定義をスプレッド演算子で統合しています。
 */
export declare const NOVEL_MONARCH_PATTERNS: {
    /** セリフ開始（「） */
    DIALOGUE_START: RegExp;
    /** セリフ終了（」） */
    DIALOGUE_END: RegExp;
    /** 二重セリフ開始（『） */
    DIALOGUE_DOUBLE_START: RegExp;
    /** 二重セリフ終了（』） */
    DIALOGUE_DOUBLE_END: RegExp;
    /** パイプありルビ（Monarch用） */
    RUBY_PIPE: RegExp;
    /** 漢字ルビ（Monarch用） */
    RUBY_KANJI: RegExp;
    /** 傍点（Monarch用） */
    BOUTEN: RegExp;
};
