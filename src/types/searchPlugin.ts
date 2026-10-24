/**
 * 検索クエリパラメータ
 */
export interface SearchQuery {
  /** 検索文字列 */
  text: string;
  /** 置換文字列 (任意) */
  replacement?: string;
  /** 大文字・小文字を区別するか */
  caseSensitive: boolean;
  /** 単語単位で一致させるか */
  wholeWord: boolean;
  /** 正規表現を使用するか */
  useRegex: boolean;
}

/**
 * 検索結果マッチ項目
 */
export interface SearchMatch {
  /** 対象ファイルの絶対パス */
  filePath: string;
  /** ファイル表示名 */
  fileTitle: string;
  /** マッチした行番号 (1始まり) */
  lineNumber: number;
  /** マッチした開始列 (1始まり) */
  column: number;
  /** マッチした文字の長さ */
  matchLength: number;
  /** 一致箇所を含む行プレビュー文字列 */
  previewLine: string;
  /** 付加情報 (メタデータ属性名、話者名など) */
  extraInfo?: string;
}

/**
 * 検索プロバイダープラグイン定義インターフェース
 */
export interface SearchProviderPlugin {
  /** 一意なプロバイダーID (例: 'novelaid.search.fulltext', 'novelaid.search.dialogue') */
  readonly id: string;
  /** 表示名 (ドロップダウンやタブに表示される名称) */
  readonly name: string;
  /** 説明文 (ツールチップ等) */
  readonly description?: string;
  /** 表示優先順位 (セレクターでの並び順) */
  readonly priority: number;

  /**
   * 検索の実行
   */
  search: (query: SearchQuery, projectPath: string) => Promise<SearchMatch[]>;

  /**
   * 一括置換の実行 (サポートする場合)
   */
  replace?: (query: SearchQuery, projectPath: string, matches?: SearchMatch[]) => Promise<void>;
}
