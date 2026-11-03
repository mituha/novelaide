# AIチャットドキュメント機能および共通UI構造化仕様

## 1. 概要と背景

本仕様は、小説執筆用エディター `novelaide` において、AIとの対話履歴をプロジェクト内の独立したドキュメント（`.ch` ファイル）として管理・保存・再開可能にするための基本設計を定義する。

これまでAIチャットは一時的なサイドパネル内でのみ行われていたが、設定相談、プロット壁打ち、キャラクターのセリフ検討などの貴重な執筆プロセスを作品資産として残し、後から見直しや対話の再開が行えるようにする。

同時に、エディター領域（左右分割ペイン）で開くチャットビューと、アクティビティバーから開くサイドパネルのAIチャットが、**内部的に同一のドキュメント構造（`ChFileStructure`）および共通UIコンポーネント（`ChatView`）を共有するアーキテクチャ** を採用し、`novelaid-editor`（Electron版）との完全な仕様互換および相互フィードバックを保証する。

---

## 2. チャットドキュメント仕様（`.ch`）

### 2.1 ファイル形式と拡張子
* **標準拡張子**: `.ch`（または `.chat`）
* **ドキュメントタイプ**: `NovelaidDocumentType::Chat`
* **本文エンコーディング**: UTF-8（JSON形式）

### 2.2 データ構造（`ChFileStructure`）

`novelaid-editor` と完全な相互運用性を持つ JSON スキーマを採用する。

```typescript
/**
 * チャットドキュメントのメタデータ
 */
export interface ChMetadata {
  title?: string;            // チャットのタイトル（例: "第1章 プロット壁打ち"）
  description?: string;      // 概要説明
  createdAt?: string;        // 作成日時 (例: "20261103114000")
  updatedAt?: string;        // 最終更新日時 (例: "20261103114500")
  defaultPersonaId?: string; // 固定ペルソナID (例: "partner")
  defaultRoleId?: string;    // "assistant"
  parameters?: {
    model?: string;          // 使用モデルID
    temperature?: number;    // 生成温度
    useTools?: boolean;      // ツール呼び出しの有効/無効
    useReasoning?: boolean;  // 推論・思考プロセスの展開
  };
}

/**
 * メッセージ内の個別パーツ（思考・ツール・テキストを分離保持）
 */
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

/**
 * 個別チャットメッセージ
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  persona?: string;          // ペルソナID
  agentId?: string;          // novelaid-editor 互換ID
  name?: string;             // 表示名
  content?: string;          // プレーンテキスト（フォールバック用）
  parts?: ChatMessagePart[]; // 構造化パーツ一覧
  timestamp?: string | number;
}

/**
 * .ch ファイルのルート構造
 */
export interface ChFileStructure {
  version: '1.0';
  metadata: ChMetadata;
  messages: ChatMessage[];
}
```

---

## 3. ビュープラグイン仕様（`ChatViewPlugin`）

エディターのドキュメント表示領域において、`.ch` ファイルをチャット専用ビューとして描画する。

* **プラグインID**: `novelaid.view.chat`
* **対応 DocumentType**: `chat`
* **初期ビューモード**: `canvas`（`getInitialViewMode('chat') === 'canvas'`）
* **ライフサイクルと連動**:
  - ドキュメントを開いた際、`DocumentState.content` を `ChFileStructure` としてパース。
  - 空ファイルの場合は初期メタデータとウェルカムメッセージを自動生成。
  - メッセージ送信・AI応答ストリーミング完了時に `onChangeContent` を通じて `DocumentState.content` を更新。
  - `novelaide` のオートセーブ、未保存状態（`isDirty`）、手動保存（Ctrl+S）、Git差分管理と完全連動。
* **生JSON編集モード（フォールバック）**:
  - ユーザーが表示モードを `canvas` から `editor` に切り替えた場合、既存の `TextEditorPlugin`（Monaco Editor）により、生の JSON テキストとして直接編集・閲覧可能。

---

## 4. サイドパネル（`AiPanelPlugin`）の内部ドキュメント化

アクティビティバーから開くサイドパネルの「AI執筆パートナー」も、独立した一時状態ではなくドキュメントとして扱う。

1. **自動永続化**:
   - プロジェクトが開かれている場合、`.novelaid/ai-chat.ch` をパネル専用ドキュメントとして自動読み込み・自動保存。
   - アプリ再起動やプロジェクト切り替え時にも、直前の会話コンテキストがそのまま復元される。
2. **チャットのエクスポート（ファイル化）**:
   - パネル上部に「チャットをファイルとして保存」ボタンを設置。
   - パネルで交わした対話を、作品フォルダ内の任意の `.ch` ファイル（例: `settings/chats/prologue_ideas.ch`）として即座に書き出し、通常ドキュメントとして引き継ぐことが可能。

---

## 5. novelaid-markdown によるルビ・装飾描画仕様

チャット内のすべてのメッセージ表示部において、`novelaid-markdown` ライブラリを採用する。

* **コンポーネント**: `MessageMarkdown`
  - `<NovelaidMarkdown content={content} className="message-markdown-body" />`
* **適用対象**:
  - ユーザー入力メッセージ
  - AIアシスタントの回答テキスト
  - 思考プロセス（`thought`）の展開本文
* **サポートする記法**:
  - 小説ルビ記法: `｜漢字《かんじ》`、青空文庫形式、カクヨム・なろう記法
  - Markdown標準記法: 見出し、太字、リスト、引用、コードブロック、テーブル
  - 数式・ダイアグラム（novelaid-markdown 拡張機能）

---

## 6. ペルソナ仕様（段階的実装）

### 6.1 固定ペルソナ（第1段階：今回実装）
以下の4種類の固定ペルソナをセレクタで切り替え可能とする：

| ペルソナID | 表示名 | 役割・用途 |
| :--- | :--- | :--- |
| **`partner`** | 執筆パートナー | 物語の展開、キャラクター設定、描写の言い換えを一緒に考える共創相手。 |
| **`editor`** | 担当編集者 | 読者視点でテンポや伏線、ストーリー構成に率直な意見・講評を出す。 |
| **`proofreader`** | 校正係 | 文章のリズム、助詞の重複、文末の連続、ルビ記法、表記ゆれを厳格にチェック。 |
| **`character`** | 作中人物 | 登場人物になりきって対話し、台詞の口調や感情の反応を検証する。 |

### 6.2 動的ペルソナ化（第2段階：将来拡張）
* プロジェクト内の登場人物ファイル（Markdown）の Frontmatter（`chat.enabled: true`, `chat.persona: ...`）から動的にペルソナを生成し、セレクタの選択肢に追加できるように拡張インターフェースを保持する。

---

## 7. 共通UIコンポーネント構成

```text
src/components/Chat/
├── ChatTypes.ts          # ChFileStructure, ChatMessage, ChatMessagePart 等の型定義
├── MessageMarkdown.tsx   # novelaid-markdown を用いたルビ・装飾描画ラッパー
├── MessageMarkdown.css   # 吹き出し内 Markdown スタイル
├── ChatMessageList.tsx   # メッセージ一覧（吹き出し、思考折りたたみ、ツール実行、操作メニュー）
├── ChatMessageList.css   # メッセージ一覧スタイル
├── ChatHeader.tsx        # ペルソナ選択・タイトルバー
├── ChatHeader.css        # ヘッダースタイル
├── AIChatInput.tsx       # テキスト入力・コンテキスト選択・送信フォーム
├── AIChatInput.css       # 入力フォームスタイル
├── ChatView.tsx          # ドキュメント・パネル共通のチャットビュー本体
└── ChatView.css          # チャットビュー全体レイアウトスタイル
```
