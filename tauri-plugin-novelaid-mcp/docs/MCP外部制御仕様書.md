# MCP外部制御仕様書

## 1. 概要

本ドキュメントは、`novelaide`（および関連アプリケーション）を外部のAIエージェントや開発環境から操作可能とする MCP (Model Context Protocol) サーバー機能および外部制御（External Control）統合仕様について規定します。

外部連携（MCP）と内部連携（Pi SDK による内蔵チャット）の双方が同一のツールセットと権限モデルを共有し、エディターの未保存バッファ状態を損なうことなく安全に執筆・編集作業を支援します。

---

## 2. アーキテクチャ

```
+-----------------------------------------------------------------------------------+
| 外部 AI クライアント (Claude Desktop / Cursor / Goose / Cline)                      |
+-----------------------------------------------------------------------------------+
       | HTTP SSE (GET /sse) / JSON-RPC (POST /message?sessionId=...)
       v
+-----------------------------------------------------------------------------------+
| Rust プラグイン (tauri-plugin-novelaid-mcp)                                        |
|  - Tokio TcpListener (公式 MCP SSE トランスポート)                                 |
|  - JSON-RPC 2.0 ディスパッチャ (initialize, tools/list, tools/call)                |
|  - 権限ガード (ReadOnly / ReadWrite チェック)                                      |
+-----------------------------------------------------------------------------------+
       | Tauri イベント ('mcp://tool-call') / コマンド ('respond_tool_call')
       v
+-----------------------------------------------------------------------------------+
| フロントエンド統合層 (ExternalControlService)                                      |
|  - 共通ツール定義 (NOVELAID_TOOLS)                                                |
|  - 統一ディスパッチャ (executeTool)                                                |
|  - 権限制御 (ReadOnlyモード時の書込拒否)                                          |
+-----------------------------------------------------------------------------------+
       | 呼出 (内部 AI / 外部 MCP 共通)
       +--------------------------------------------+
       |                                            |
       v                                            v
+-----------------------------+      +----------------------------------------------+
| エディターバッファ & FS      |      | 各種プラグイン                               |
| - DocumentContext           |      | - 校正: tauri-plugin-novelaid-calibration     |
| - FileService               |      | - ルビ: tauri-plugin-novelaid-ruby            |
|                             |      | - メタデータ: tauri-plugin-novelaid-metadata  |
+-----------------------------+      +----------------------------------------------+
```

---

## 3. 権限モデル

### 3.1 権限レベル（McpPermissionLevel）
- **`ReadOnly`（読み取り専用）**:
  - `read_file`, `list_files`, `scan_proofread`, `extract_ruby`, `search_metadata` のみ実行可能。
  - `write_file`, `edit_file` 等の破壊的操作は拒否（JSON-RPC エラーコード `-32001 Permission denied`）。
- **`ReadWrite`（読み書き可能）**:
  - 全てのツールが実行可能。

### 3.2 二重保護
1. **Rust 層**: `server.rs` 内でツール要求受信時、設定が `ReadOnly` であり要求ツールが書き込み系である場合、即座に拒否レスポンスを返却。
2. **フロントエンド層**: `externalControlService.ts` 内でも二重チェックを行い、意図しない破壊的変更を完全に防止。

---

## 4. ツール仕様一覧

1. **`read_file`** (Read)
   - 引数: `path` (string)
   - 挙動: 現在エディターで開いており未保存バッファが存在する場合はその最新内容を返却。開かれていない場合はファイルシステム（`tauri-plugin-novelaid-fs`）から読み取り返却。
2. **`write_file`** (Write)
   - 引数: `path` (string), `content` (string)
   - 挙動: ファイルシステムに書き込み、現在エディターで開かれている場合はバッファの内容も最新化。
3. **`edit_file`** (Write)
   - 引数: `path` (string), `old_string` (string), `new_string` (string)
   - 挙動: ファイル内の特定テキストを置換。
4. **`list_files`** (Read)
   - 引数: `path` (string, optional)
   - 挙動: ディレクトリ内のファイル・フォルダ一覧を取得。
5. **`scan_proofread`** (Read)
   - 引数: `text` (string, optional), `path` (string, optional)
   - 挙動: Lindera 形態素解析による日本語文章校正（重複助詞、ら抜き言葉、二重否定等）を実行。
6. **`extract_ruby`** (Read)
   - 引数: `text` (string, optional), `path` (string, optional)
   - 挙動: 青空文庫形式ルビの抽出と解析結果を取得。
7. **`search_metadata`** (Read)
   - 引数: `query` (string), `category` (string, optional)
   - 挙動: 人名・地名・組織などのプロジェクト内メタデータを前方一致検索。
