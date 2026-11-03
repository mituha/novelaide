/**
 * pi-coding-agent / pi-agent-core 準拠の執筆支援ツール定義
 */

export type ToolPermissionCategory = 'read' | 'write';
export type ToolPermissionLevel = 'none' | 'read' | 'write';

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermissionCategory;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Pi SDK 標準互換のファイル操作ツール定義
 * (novelaid-cli の @earendil-works/pi-coding-agent 標準ツールと完全互換)
 */
export const PI_STANDARD_TOOLS: ToolDefinition[] = [
  {
    name: 'read',
    description: 'Read the contents of a file in the novel project. Supports manuscript, plots, and settings files.',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read (relative to project or file name)',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed, optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read (optional)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write',
    description: 'Write content to a file. Creates a new file or replaces content through DocumentState.',
    permission: 'write',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write (relative to project or file name)',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit',
    description: 'Edit a file using exact text replacement. Proposes minimal changes to manuscript or notes.',
    permission: 'write',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit (relative to project or file name)',
        },
        edits: {
          type: 'array',
          description: 'One or more targeted text replacements.',
          items: {
            type: 'object',
            properties: {
              oldText: {
                type: 'string',
                description: 'Exact text to be replaced (must match existing file content exactly)',
              },
              newText: {
                type: 'string',
                description: 'Replacement text',
              },
            },
            required: ['oldText', 'newText'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
];

/**
 * novelaid 小説執筆特化拡張ツール一覧
 */
export const NOVELAID_AI_TOOLS: ToolDefinition[] = [
  {
    name: 'scan_proofread',
    description: '小説原稿の文末過去形連続、ら抜き言葉、冗長表現を高速スキャンして問題箇所を抽出します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '解析対象の原稿テキスト（省略時は現在アクティブな原稿が対象）',
        },
        fileName: {
          type: 'string',
          description: '原稿ファイル名（任意）',
        },
      },
      required: [],
    },
  },
  {
    name: 'extract_ruby',
    description: '本文内の難読漢字や固有名詞からルビ候補を自動抽出し、novelaid形式（|親文字《ルビ》）を提案します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '解析対象の本文テキスト（省略時は現在アクティブな原稿が対象）',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_metadata',
    description: 'プロジェクト内の設定資料（登場人物、世界観、タイムライン等）から指定キーワードに関連する記述を検索します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '検索キーワード（キャラクター名、用語等）',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_open_documents',
    description: '現在エディターで開かれているドキュメント（タブ）一覧と未保存状態を取得します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_active_document',
    description: '現在フォーカスされている原稿の最新バッファ（未保存テキスト含む）を取得します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        side: {
          type: 'string',
          enum: ['left', 'right'],
          description: '左右ペインの指定（省略時はアクティブペイン）',
        },
      },
      required: [],
    },
  },
];

/**
 * 全ツール定義の結合リスト
 */
export const ALL_TOOLS: ToolDefinition[] = [...PI_STANDARD_TOOLS, ...NOVELAID_AI_TOOLS];
