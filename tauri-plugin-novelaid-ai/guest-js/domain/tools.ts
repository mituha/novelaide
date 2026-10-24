/**
 * pi-coding-agent および OpenAI 互換の執筆支援ツール定義 (JSON-Schema)
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * 共通ツール一覧（OpenAI Function Calling 形式）
 */
export const NOVELAID_AI_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "scan_proofread",
      description: "小説原稿の文末過去形連続、ら抜き言葉、冗長表現を高速スキャンして問題箇所を抽出します。",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "解析対象の本文原稿テキスト",
          },
          fileName: {
            type: "string",
            description: "原稿ファイル名（任意）",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_ruby",
      description: "本文内の難読漢字や固有名詞からルビ候補を自動抽出し、novelaid形式（|親文字《ルビ》）を提案します。",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "解析対象の本文テキスト",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_metadata",
      description: "プロジェクト内の設定資料（登場人物、世界観、タイムライン等）から指定キーワードに関連する記述を検索します。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "検索キーワード（キャラクター名、用語等）",
          },
        },
        required: ["query"],
      },
    },
  },
];
