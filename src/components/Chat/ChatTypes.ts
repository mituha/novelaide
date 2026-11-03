/**
 * チャットドキュメント（.ch ファイル）およびチャットUI関連の型定義
 * novelaid-editor (Electron版) との100%相互運用性を保持
 */

export interface ChMetadata {
  title?: string;
  description?: string;
  createdAt?: string;        // 'YYYYMMDDHHmmss'
  updatedAt?: string;        // 'YYYYMMDDHHmmss'
  defaultPersonaId?: string; // 'partner' | 'editor' | 'proofreader' | 'character'
  defaultRoleId?: string;    // 'assistant'
  parameters?: {
    model?: string;
    temperature?: number;
    useTools?: boolean;
    useReasoning?: boolean;
  };
}

export interface ChatMessagePart {
  type: 'text' | 'thought' | 'tool_call' | 'error';
  content: string;
  metadata?: {
    tool_call?: {
      id: string;
      name: string;
      arguments?: Record<string, any>;
      result?: any;
    };
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  persona?: string;          // ペルソナID
  agentId?: string;          // novelaid-editor 互換ID
  name?: string;             // 表示名
  content?: string;          // プレーンテキスト（フォールバック用）
  parts?: ChatMessagePart[]; // 思考/ツール/テキストの複合構造
  timestamp?: string | number;
}

export interface ChFileStructure {
  version: '1.0';
  metadata: ChMetadata;
  messages: ChatMessage[];
}

export interface PersonaDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
}

/**
 * 固定ペルソナ4種の標準定義
 */
export const DEFAULT_STATIC_PERSONAS: PersonaDefinition[] = [
  {
    id: 'partner',
    name: '執筆パートナー',
    role: '共創・アイデア出し',
    description: '物語の展開やキャラクター設定、描写の言い換えを一緒に考えます。',
    systemPrompt: 'あなたは小説作家の執筆パートナーです。作品の世界観を尊重し、魅力的なプロットや情景描写、キャラクター造形のアイデアを一緒に広げてください。',
  },
  {
    id: 'editor',
    name: '担当編集者',
    role: '講評・プロット構成',
    description: '読者視点で作品のテンポや伏線、ストーリー構成に率直な意見を出します。',
    systemPrompt: 'あなたは経験豊富な小説の担当編集者です。読者視点に立って、物語の導入、テンポ、伏線の張り方、キャラクターの魅力について建設的で率直なフィードバックを提供してください。',
  },
  {
    id: 'proofreader',
    name: '校正係',
    role: '文体・ルビ・誤字脱字',
    description: '助詞の重なり、文末の連続、ルビ記法、表記ゆれを厳格にチェックします。',
    systemPrompt: 'あなたは厳格な出版社の文芸校正係です。文章のリズム、助詞の重複、文末の単調な連続、ルビ記法、誤字脱字、表記ゆれを精緻にチェックし、改善案を提示してください。',
  },
  {
    id: 'character',
    name: '作中人物',
    role: 'キャラクター対話',
    description: '登場人物になりきって対話し、台詞の口調や感情の反応を検証します。',
    systemPrompt: 'あなたは小説の登場人物です。設定や口調に忠実になりきって、作家からの問いかけに対話し、セリフや行動の自然さを作家と一緒に検証してください。',
  },
];
