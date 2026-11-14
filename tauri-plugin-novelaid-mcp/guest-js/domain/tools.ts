/**
 * novelaid 外部制御および MCP 共通ツール定義
 * (MCP サーバーおよび Pi SDK 互換)
 */

export type ToolPermissionCategory = 'read' | 'write';
export type ToolPermissionLevel = 'none' | 'read' | 'write';

export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermissionCategory;
  parameters: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

/**
 * novelaid 共通ツール定義一覧
 */
export const NOVELAID_TOOLS: ToolDefinition[] = [
  // 1. ファイル読み込み
  {
    name: 'read_file',
    description: 'プロジェクト内のファイル（原稿・設定・プロット等）を読み込みます。エディターで開かれている未保存バッファを最優先します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '読み込み対象のファイルパス（プロジェクト相対パスまたはファイル名）',
        },
        offset: {
          type: 'number',
          description: '開始行番号（1-indexed, 省略時は先頭）',
        },
        limit: {
          type: 'number',
          description: '最大読み込み行数（省略時はファイル末尾まで）',
        },
      },
      required: ['path'],
    },
  },
  // 2. 開いているドキュメント一覧
  {
    name: 'get_open_documents',
    description: '現在エディターで開かれているドキュメント（タブ）一覧と未保存（dirty）状態を取得します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 3. アクティブドキュメントのバッファ取得
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
  // 4. 設定資料・メタデータ検索
  {
    name: 'search_metadata',
    description: '作品内の設定資料（登場人物・地名・世界観・プロット）のFrontmatterおよび本文をキーワード検索します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '検索するキーワードやキャラクター名（例: "主人公", "帝都", "魔法"）',
        },
      },
      required: ['query'],
    },
  },
  // 5. 校正チェック（Lindera）
  {
    name: 'scan_proofread',
    description: '原稿テキストに対し、純Rust製 Lindera による本格校正（三点リーダー、会話文末、重言、ら抜き言葉等）を実行します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '校正対象のテキスト（省略時は現在アクティブな原稿の全バッファ）',
        },
      },
      required: [],
    },
  },
  // 6. ルビ候補抽出
  {
    name: 'extract_ruby',
    description: '本文内の難読漢字や固有名詞からルビ候補を自動抽出し、novelaid形式（|親文字《ルビ》）を返却します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'ルビ抽出対象のテキスト（省略時は現在アクティブな原稿の全バッファ）',
        },
      },
      required: [],
    },
  },
  // 7. プロジェクト構造取得
  {
    name: 'get_project_structure',
    description: 'プロジェクト内のファイルツリー構造（原稿・設定・プロット一覧）を取得します。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 8. ファイル書き込み（全置換・新規作成）
  {
    name: 'write_file',
    description: 'ファイルの内容を新規作成または全置換更新します（エディターバッファへ即時同期、未保存状態）。',
    permission: 'write',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '書き込み対象のファイルパス（プロジェクト相対パス）',
        },
        content: {
          type: 'string',
          description: 'ファイルの内容',
        },
      },
      required: ['path', 'content'],
    },
  },
  // 9. ファイル差分編集（部分置換）
  {
    name: 'edit_file',
    description: '原稿または設定ファイルに対し、完全一致テキスト置換（oldText -> newText）による安全な部分編集を適用します。',
    permission: 'write',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '編集対象のファイルパス（プロジェクト相対パス）',
        },
        edits: {
          type: 'array',
          description: '置換ブロックの配列',
          items: {
            type: 'object',
            properties: {
              oldText: {
                type: 'string',
                description: '置換前の完全一致テキスト（原稿内のテキストと完全一致する必要があります）',
              },
              newText: {
                type: 'string',
                description: '置換後の新しいテキスト',
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
 * 指定権限レベルでフィルタリングされたツール一覧を取得する
 */
export function getFilteredTools(permission: ToolPermissionLevel): ToolDefinition[] {
  if (permission === 'none') {
    return [];
  }
  if (permission === 'read') {
    return NOVELAID_TOOLS.filter((t) => t.permission === 'read');
  }
  return NOVELAID_TOOLS;
}
