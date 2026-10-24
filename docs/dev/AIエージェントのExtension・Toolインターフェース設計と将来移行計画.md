# AIエージェントの Extension・Tool インターフェース設計と将来移行計画書

## 1. 概要と基本方針

本ドキュメントは、**`novelaide`** における AI 執筆支援機能について、将来的な **`novelaid-cli` バイナリのバックエンド/Sidecar 実行へのシームレスな移行**を見据え、現段階（WebView/フロントエンド駆動）において最も無駄がなく、コード共通化度が高いアーキテクチャを再定義するものです。

### 1.1 核心的な設計思想
1. **Tool の中身を「プロキシ」と「実体」で切り替え可能にする**:
   - Pi SDK における Extension（拡張機能）は、`registerTool` と `registerCommand` によってツールとコマンドをエージェントに提供します。
   - Tool の本質は「名前・引数スキーマ・説明」のインターフェース規約であり、その中身（`execute` 関数）を：
     - **GUI (novelaide)**: Tauri IPC（`invoke('plugin:novelaid-ai|ai_run_tool', ...)`）を通じて Rust/FS バックエンドへ委譲する「IPCプロキシ」として動作。
     - **CLI (novelaid-cli)**: ローカルのファイル操作や解析モジュール（`proofread.ts`, `ruby.ts`）を直接実行する「直接実体」として動作。
     - **将来の Sidecar モード**: フロントエンドから Sidecar プロセスへ JSON-RPC で転送する「Sidecarプロキシ」として動作。
   - このように設計すれば、登録するツールやコマンドのインターフェースは 100% 共通化でき、将来の移行コストを最小限に抑えられます。

2. **Pi SDK 標準の `registerTool` および Extension API の採用**:
   - 静的なツール配列（`NOVELAID_AI_TOOLS`）を直渡しするのではなく、Extension のファクトリ関数内で `api.registerTool(...)` を通じて登録する標準規約に準拠します。

3. **コマンド（Slash Commands）の事前インターセプト機構**:
   - GUI は TUI（ターミナル）とは異なり直接シェルを持ちませんが、チャット入力欄（`AIChatPanel`）で作家が `/ruby` や `/proofread`、`/clear`、`/help` などを入力した際に、LLM への送信前に Extension の `registerCommand` レジストリへ割り込み（インターセプト）して即座にローカル実行できるようにします。
   - これにより、CLI と GUI で同一のコマンド体験とヘルプ案内が完全共有されます。

---

## 2. アーキテクチャ構成

### 2.1 共通インターフェース規約 (`novelaidExtension`)

```text
               [ novelaidExtension (共通Extension定義) ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
   [ novelaide (GUI) ]                           [ novelaid-cli (CLI) ]
   ├─ Tool 実装: Tauri IPC プロキシ              ├─ Tool 実装: 直接ローカル実行
   ├─ Command: チャット入力インターセプト         ├─ Command: TUI スラッシュコマンド
   └─ 実行環境: WebView / Browser                 └─ 実行環境: Node.js Terminal
```

### 2.2 ツール一覧とインターフェース定義

| ツール名 | 説明 | 引数スキーマ | GUI側の委譲先 (IPC) | CLI側の委譲先 (ローカル) |
| :--- | :--- | :--- | :--- | :--- |
| `scan_proofread` | 文末重複・誤字・冗長表現のスキャン | `{ text?: string }` | `plugin:novelaid-ai\|ai_run_tool` (proofread_scan) | `scanProofreadIssues(text)` |
| `extract_ruby` | 難読漢字・固有名詞のルビ候補抽出 | `{ text?: string }` | `plugin:novelaid-ai\|ai_run_tool` (ruby_suggest) | `extractRubyList(text)` |
| `search_metadata` | Frontmatter設定資料の検索 | `{ query: string }` | `plugin:novelaid-ai\|ai_run_tool` (search_metadata) | `frontmatter.ts` キャッシュ検索 |

---

## 3. 実装詳細

### 3.1 `ExtensionAPI` エミュレーションと `registerTool` / `registerCommand`
フロントエンド側（`tauri-plugin-novelaid-ai`）に、Pi SDK 公式の `ExtensionAPI` 互換レイヤーを整備します。

```typescript
export interface NovelaidExtensionContext {
  tools: Map<string, ToolDefinition>;
  commands: Map<string, CommandDefinition>;
  registerTool: (tool: ToolDefinition) => void;
  registerCommand: (name: string, def: CommandDefinition) => void;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
}
```

### 3.2 コマンドインターセプト機構 (`AIChatPanel`)
ユーザーが入力したメッセージが `/` で始まる場合（例: `/ruby`, `/proofread`, `/help`）：
1. 登録された `commands` レジストリを検索。
2. 一致するコマンドが存在する場合は、LLM へのリクエストを中断し、コマンドハンドラーを実行。
3. コマンドの出力（通知テキスト）をシステムメッセージまたはアシスタント吹き出しとしてタイムラインに即座に表示。

### 3.3 将来の Sidecar 移行への布石
将来 `novelaid-cli` を Tauri の Sidecar として同梱・起動する場合：
- フロントエンド側の `chatSession` は、Sidecar の標準入出力（JSON-RPC）と接続する通信クライアントに差し替えるだけ。
- UIコンポーネント、コンテキストセレクター、ツールインターフェース、コマンド体系は 1 行も変更することなくそのまま移行可能。

---

## 4. 段階的実装計画

1. **仕様計画書の策定と先行コミット (現在)**: 本ドキュメントを作成し Git コミット。
2. **`novelaidExtension.ts` のリファクタリング**:
   - `api.registerTool` によるツール登録規約の完全適用。
   - `api.registerCommand` による共通コマンド（`/ruby`, `/proofread`, `/info`, `/help`）の登録。
   - Tool 実行関数を環境（IPC プロキシ vs ローカル実装）に応じて差し替えられるインターフェース設計。
3. **`chatSession.ts` の Pi SDK Extension 統合**:
   - Extension から収集したツール一覧を `Agent` に提供。
   - コマンド実行（ディスパッチ）インターフェースの公開。
4. **`AIChatPanel.tsx` でのスラッシュコマンドインターセプト**:
   - `/` コマンドの事前検知と即時実行。
5. **検証 & スクリーンショット更新 & バージョン更新（`npm version patch`）**。
