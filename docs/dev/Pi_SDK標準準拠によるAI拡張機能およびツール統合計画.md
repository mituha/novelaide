# Pi SDK 標準準拠による AI 拡張機能・ツール統合計画書

## 1. 概要と目的

本ドキュメントは、**`novelaide`** の AI 執筆支援機能（`tauri-plugin-novelaid-ai`）において、上位層で独自に抱え込んでいた通信処理（`createLmStudioStreamFn` 等）やツールディスパッチ機構を全廃し、**`@earendil-works/pi-coding-agent`（Pi SDK）の標準機構（`ModelRuntime`, `createAgentSession`, `InlineExtension`, `registerTool`）へ完全移行**するための設計仕様を定義するものです。

### 1.1 導入の主目的
1. **煩雑な独自処理の撤廃**:
   - 手動の SSE（Server-Sent Events）パース、低レベル `Agent` の配線、自前ツールループを全廃し、Pi SDK の標準機能に委譲する。
2. **`novelaid-cli` との完全なコード互換・共通化**:
   - `novelaid-cli` で実績のある `InlineExtension` パターンを採用し、`api.registerProvider`、`api.registerTool`、`api.on("before_agent_start")` の同一規格で実装する。
3. **将来の `novelaid-editor` への最小コストフィードバック**:
   - Pi SDK 標準に準拠した Extension として独立させることで、Electron版（`novelaid-editor`）への移植も同一コードで完了できるようにする。

---

## 2. アーキテクチャの対比（Before / After）

### 従来の構成（Before: 上位独自実装が混在）
```text
[AIChatPanel]
    │
    ▼
[PiWritingAgentSession]
    │
    ├─ (独自) createLmStudioStreamFn ── 手動 fetch / SSE パース / 手動フォールバック
    ├─ (低レベル) new Agent() ──────── 手動 StreamFn 注入 / 手動 parameters パース
    └─ (独自) 自前ツール定義 & 手動ディスパッチ
```

### 改善後の構成（After: Pi SDK 標準への完全委譲）
```text
[AIChatPanel (UI)]
    │ session.prompt(userMessage)
    ▼
[AgentSession (Pi SDK 標準)]
    │
    ├─ ModelRuntime / registerProvider ── SDK 標準プロバイダー（LM Studio / OpenAI 等）
    ├─ InlineExtension ("novelaid-extension")
    │    ├─ api.registerProvider("lm-studio", ...)
    │    ├─ api.registerTool("scan_proofread", ...) ── Rust コマンド呼び出し
    │    ├─ api.registerTool("extract_ruby", ...)   ── Rust コマンド呼び出し
    │    ├─ api.registerTool("search_metadata", ...) ── Rust コマンド呼び出し
    │    └─ api.on("before_agent_start") ────────── ペルソナ & コンテキスト動的注入
    │
    └─ session.subscribe(event => ...) ── text_delta, tool_call などを UI へ流すだけ
```

---

## 3. 具体的な実装設計

### 3.1 `novelaidExtension.ts`（Pi SDK InlineExtension）の導入
`tauri-plugin-novelaid-ai/guest-js/extensions/novelaidExtension.ts` を新設し、Pi SDK の `InlineExtension` として以下の責務を集約します。

1. **プロバイダー登録**:
   ```ts
   api.registerProvider("lm-studio", {
     name: "LM Studio",
     baseUrl: lmStudioUrl,
     apiKey: "lm-studio",
     api: "openai-completions",
     models: sdkModels,
   });
   ```
2. **ツール登録 (`api.registerTool`)**:
   - `scan_proofread`: 原稿の文末重複、誤字脱字スキャン（Tauri Rust コマンド `plugin:novelaid-ai|ai_run_tool` を呼び出し）
   - `extract_ruby`: 難読漢字・固有名詞のルビ抽出（Tauri Rust コマンド呼び出し）
   - `search_metadata`: 登場人物・地名・設定資料の検索（Tauri Rust コマンド呼び出し）
3. **コンテキスト・ペルソナ注入 (`api.on("before_agent_start")`)**:
   - 選択された執筆ペルソナ（執筆パートナー、担当編集者、校正係、作中人物）のガイドラインを注入。
   - エディターで選択されている原稿・設定資料テキスト（`[File: ...]```...```）を `novelaid_context` セクションとして注入。

### 3.2 `chatSession.ts` のスリム化
`createLmStudioStreamFn` および低レベル `Agent` の自前初期化を削除し、Pi SDK の公式ファクトリ関数 `createAgentSession` に一本化します。

```ts
const { session } = await createAgentSession({
  modelRuntime: runtime,
  model: selectedModel,
  inlineExtensions: [
    createNovelaidExtension({
      lmStudioUrl,
      currentPersona,
      contextContent,
    }),
  ],
});
```

UI側は `session.subscribe` で届くイベント（`message_start`, `message_update`, `tool_call_start`, `tool_call_end`, `turn_end`）を受け取り、吹き出しを更新するだけの極めてシンプルな状態管理に専念します。

---

## 4. 移行ステップと実施結果

1. **仕様策定と Git コミット (完了)**: 本計画書をコミットし方針を固定。
2. **`novelaidExtension.ts` の実装 (完了)**:
   - Pi SDK の `InlineExtension` 規約に準拠した `createNovelaidExtension` を実装。
   - `api.registerProvider("lm-studio", ...)` によるプロバイダー登録。
   - `api.registerTool` による執筆ツール（`scan_proofread`, `extract_ruby`, `search_metadata`）の登録と Rust IPC 委譲。
   - `api.on("before_agent_start")` によるペルソナおよび原稿・設定資料コンテキストの動的注入。
3. **`chatSession.ts` のリファクタリング (完了)**:
   - 独自の `createLmStudioStreamFn`（手動 fetch / SSE パース）を完全撤去。
   - Pi SDK 標準の `ModelRuntime` と `createAgentSession` によるセッション生成へ一本化。
   - `session.subscribe` によるイベント受信（`message_start`, `message_update`, `tool_call_start`, `tool_call_end`, `turn_end`）を UI に中継するのみの薄い構成に整理。
4. **`AIChatPanel.tsx` との接続調整 (完了)**:
   - UI 側からの直接的なプロンプト実行とツール実行インジケーター表示の連動を確認。
5. **ビルド検証 & 動作確認 (完了)**:
   - `npm run build:plugin:ai`（Rollup）および `npm run build`（Vite + TypeScript）のバンドル成功を確認。
6. **日次作業ログ・メイキング更新 & バージョン更新（`npm version patch`） (完了)**。
