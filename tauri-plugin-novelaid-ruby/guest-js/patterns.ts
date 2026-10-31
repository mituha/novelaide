/**
 * ルビおよび傍点に関する正規表現パターン。
 * カクヨム記法およびなろう記法に準拠したパターンを提供します。
 */
export const RUBY_PATTERNS = {
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
export const DIALOGUE_PATTERNS = {
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
export const NOVEL_PATTERNS = {
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
export const NOVEL_MONARCH_PATTERNS = {
  ...RUBY_PATTERNS.MONARCH,
  ...DIALOGUE_PATTERNS.MONARCH,
};
