# 57. 外部AIエージェント連携MCPサーバー新設と内蔵AIツール実行の一元化

こんにちは！ 小説執筆用エディター **`novelaide`**（コードネーム: `novelaid-e`）の開発メイキング連載第57回です。

今回は、小説執筆エディター `novelaide` を外部の最新 AI エージェント（Claude Desktop、Cursor、Goose、Cline など）から直接操作できるようにするための **MCP (Model Context Protocol) サーバー機能**の新設と、アプリ内部の AI アシスタント（Pi SDK）と外部連携をひとつに束ねる **「外部制御（External Control）」統合アーキテクチャ**の実現についてお届けします！

---

## 1. 今回の課題とユーザープロンプト

### ユーザーからのリクエスト
エディター内で動作する既存の AI 執筆チャット機能（Pi SDK）に加えて、外部の高度な AI エージェントからもエディターのファイルを安全に読み書き・校正したいという要望が寄せられました。

```markdown
> /plan novelaideを外部からAIで操作できるようにするための、mcp(サーバー)機能の追加を検討します。
>
> * 機能は設定でON/OFFできるものとします
>     + 権限として、読み込み、書き込みで分類して書き込み制限が可能としてください
>
> 対応する機能を考えた場合、現在のAI機能としてのPi SDKからのアクセス方法とほぼ同等になると考えられます。
>
> Pi SDK => フロントエンド => 各種処理
> MCP => フロントエンド => 各種処理
>
> これらの統合も含めて検討してください。
> また、プラグイン名称的にはmcpですが、Pi SDKからのアクセス部分も含めて外部制御とみなしてまとめてください。
```

### 設計上の3つのポイント
1. **未保存バッファとの完全同期**:
   外部の AI がファイルを読み書きする際、ディスク上のファイルだけを見てしまうと、エディターで執筆中の「未保存バッファ」と食い違い、原稿が先祖返りしてしまいます。そのため、**「未保存バッファを最優先で参照・更新する」フロントエンドパイプライン**を経由する必要があります。
2. **二層の権限ガード（Read / Write）**:
   誤って外部 AI が原稿を破壊しないよう、「読み込み専用（`read`）」と「読み書き可能（`write`）」の書き込み制限モードを設け、Rust 側とフロントエンド側の二重で不正な書き込み要求を遮断します。
3. **Pi SDK と MCP の完全一元化**:
   これまでは内蔵 AI チャット（`ChatView.tsx`）の中に約400行の局所的なファイル検索・置換・校正ハンドラーがベタ書きされていました。これを独立したサービス `externalControlService.ts` へ抽出し、内蔵 AI も外部 MCP も全く同一のツールセット・権限ロジックで動作するように統合します。

---

## 2. 外部制御の統合アーキテクチャ

設計したアーキテクチャは以下の通りです。

```mermaid
graph TD
    subgraph External ["外部 AI クライアント"]
        Claude["Claude Desktop / Cursor / Goose"]
    end

    subgraph Internal ["アプリ内蔵 AI チャット"]
        PiAgent["Pi SDK (Writing Agent)"]
    end

    subgraph Backend ["Rust プラグイン (tauri-plugin-novelaid-mcp)"]
        Tcp["Tokio TcpListener (SSE / JSON-RPC)"]
        RustGuard["Rust層 権限ガード (ReadOnly / ReadWrite)"]
    end

    subgraph Frontend ["フロントエンド共通層 (ExternalControlService)"]
        Dispatcher["統一ディスパッチャ (executeTool)"]
        FEGuard["フロントエンド層 権限ガード"]
        BufferResolver["未保存バッファ解決 (DocumentContext)"]
    end

    subgraph Engines ["各種プラグイン・エンジン"]
        Calib["文章校正: Lindera (novelaid-calibration)"]
        Ruby["ルビ抽出: novelaid-ruby"]
        Meta["メタデータ検索: novelaid-metadata"]
        FS["ファイルIO: novelaid-fs"]
    end

    Claude -->|"HTTP SSE / POST"| Tcp
    Tcp --> RustGuard
    RustGuard -->|"Tauri Event"| Dispatcher
    PiAgent -->|"直接呼出"| Dispatcher

    Dispatcher --> FEGuard
    FEGuard --> BufferResolver
    BufferResolver --> Calib
    BufferResolver --> Ruby
    BufferResolver --> Meta
    BufferResolver --> FS
```

### 提供される公式ツール一覧

| ツール名 | 権限 | 説明 |
| :--- | :--- | :--- |
| `read_file` (`read`) | Read | エディターで開かれている未保存バッファを最優先で参照（オフセット・行数指定対応） |
| `list_files` | Read | プロジェクト内ファイル一覧および開いているタブ一覧を取得 |
| `scan_proofread` | Read | 純Rust製 Lindera による形態素解析文章校正（重複助詞、ら抜き言葉等）を実行 |
| `extract_ruby` | Read | 青空文庫形式ルビの抽出と解析を実行 |
| `search_metadata` | Read | 人名・地名・組織等の作品ナレッジを前方一致検索 |
| `write_file` (`write`) | Write | ファイルの新規作成・上書き保存（エディターバッファを即時同期） |
| `edit_file` (`edit`) | Write | テキストの完全一致部分置換（エディターバッファを即時同期） |

---

## 3. 実装のステップとポイント

### ① 新プラグイン `tauri-plugin-novelaid-mcp` の新設
Tauri v2 プラグインとして `tauri-plugin-novelaid-mcp` を新設しました。
外部ライブラリへの過度な依存を避け、Tauri 内蔵の `tokio::net::TcpListener` を用いて、公式 MCP SSE 仕様（`GET /sse` によるセッション初期化とイベントストリーム購読、`POST /message?sessionId=...` による JSON-RPC 2.0 リクエスト受信）をコンパクトかつ堅牢に実装しました。

ツール呼び出しリクエストを受信すると、Tauri の `app.emit("mcp://tool-call", ...)` イベントを通じてフロントエンドへ中継され、フロントエンドから `respond_tool_call` IPC コマンドで結果が返されると SSE 経由で AI クライアントへプッシュされます。

### ② 共通外部制御サービス `externalControlService.ts`
内蔵 AI チャットと外部 MCP の双方から呼び出される統括サービス `src/services/externalControlService.ts` を新設しました。

```typescript
// 統一ディスパッチャーによる安全なツール実行
const res = await externalControlService.executeTool(toolName, args, {
  allowWrite: mcpPermission === 'write',
  source: 'external-mcp',
});
```

`DocumentContext.tsx` と連動させることで、エディターが現在開いているタブ一覧（`openDocuments`）やアクティブな原稿（`activeDocument`）が常にサービスへバインドされます。AI が原稿を修正すると、エディター画面のバッファが即座に書き換わり、ユーザーの画面にリアルタイムで反映されます。

### ③ 内蔵 AI チャット（`ChatView.tsx`）の劇的スリム化
これまで `ChatView.tsx` の中にベタ書きされていた約400行のツール実行コードをすべて撤廃し、`externalControlService.executeTool` を呼ぶだけのシンプルな構造にリファクタリングしました。これにより、内蔵 AI と外部 AI が全く同じ賢いファイル名ファジーマッチングや校正エンジンを共有できるようになりました。

### ④ 設定画面（`AiSettingsPlugin.tsx`）への MCP 管理 UI 追加
設定画面の「AI執筆アシスタント」タブ内に「外部制御 / MCP サーバー連携」セクションを新設しました。

- **MCP サーバー有効化スイッチ**: ON にするとバックエンドで即座にサーバーが起動し、ポート番号（デフォルト: 3000）で待ち受けを開始します。
- **外部アクセス権限選択**:
  - `読み込み専用 (read)`: 推奨・安全モード。原稿の変更は一切行わず、資料参照や校正チェックのみを AI に許可します。
  - `読み書き可能 (write)`: ファイルの保存・差分置換まで AI に委ねるフルオート執筆モードです。
- **接続 URL 案内**: `http://127.0.0.1:3000/sse` をそのまま Claude Desktop、Cursor、LM Studio 等の MCP 設定に登録して利用できます。

---

## 4. 実践：LM Studio を活用した MCP 接続とローカルデバッグ

MCP サーバーを実装したら、実際に外部の AI クライアントから接続してテストしてみましょう！

開発・デバッグ時のクライアントとして特におすすめなのが、ローカル LLM 実行環境である **[LM Studio](https://lmstudio.ai/)** です。

### なぜ LM Studio が MCP デバッグに最適なのか？
1. **完全無料・セキュア・オフライン**:
   外部の商用 API キーやトークン消費を気にせず、手元のローカルモデル（Qwen 2.5、Llama 3.1、Gemma 2 等）を使って何度でもツール呼び出しの疎通テストが行えます。
2. **ツールの入出力が視覚的に丸見え**:
   チャット画面上で「AI がどのツールを選んだか」「どんな引数（JSON）を渡したか」「エディターからどんな結果が返ったか」がアコーディオン形式で一目瞭然に表示されます。
3. **SSE (Server-Sent Events) トランスポートにネイティブ対応**:
   最新の LM Studio では MCP 機能が強化されており、`novelaide` の提供する SSE エンドポイントへ簡単に接続できます。

---

### ステップ 1: `novelaide` 側でサーバーを起動
1. `novelaide` の画面左下（またはアクティビティバー）の歯車アイコンをクリックし、設定モーダルを開きます。
2. **「AI執筆アシスタント」** タブを選択し、下部の **「外部制御 / MCP サーバー連携」** セクションへスクロールします。
3. **「MCP サーバーを有効化」** スイッチを ON にします（ポート番号: `3000`）。
4. 外部アクセス権限は、安全のためまずは **「読み込み専用 (read)」** を選択しておきます。

---

### ステップ 2: LM Studio への MCP サーバー登録
LM Studio 側の設定ファイル（または MCP 連携パネル）に、以下のように SSE エンドポイントを登録します。

```json
{
  "mcpServers": {
    "novelaide": {
      "url": "http://127.0.0.1:3000/sse"
    }
  }
}
```

登録後、LM Studio のチャット画面右上のツール（Tools / MCP）アイコンを確認すると、`novelaide` に接続され、以下のようなツール一覧が自動的に認識されます。
- `read_file`: ファイル/未保存バッファの読み込み
- `list_files` / `get_project_structure`: プロジェクト内ファイル一覧と構造の取得
- `search_metadata`: 登場人物・地名・設定資料の全文検索
- `scan_proofread`: Lindera 形態素解析による日本語文章校正
- `extract_ruby`: 青空文庫ルビの抽出

---

### ステップ 3: LM Studio のチャットから呼び出してみる！
LM Studio のチャットで、Tool Calling に対応したモデル（例: `qwen2.5-7b-instruct` や `hermes-3-llama-3.1-8b` 等）をロードし、自然な日本語で話しかけてみます。

#### 例 1: プロジェクト構成の問い合わせ
> **ユーザー**: 「この小説プロジェクトにはどんなファイルがありますか？ 構造を教えてください」
>
> **LM Studio の挙動**:
> 1. LLM が自動的に `get_project_structure` ツールを選択して呼び出し。
> 2. `novelaide` 側で現在開いているプロジェクトの300件以上のファイルツリーを走査し、重要フォルダ（設定資料・プロット・原稿）を優先整列した要約テキスト（`summaryText`）を返却。
> 3. **AI の返答**: 「プロジェクトには第1章〜第5章の原稿ファイルと、`00_設定資料/` 配下にキャラクターシートや世界観設定のファイルが含まれています……」

#### 例 2: 登場人物設定の検索
> **ユーザー**: 「登場人物の『ミラ』や『水龍レヴィ』の設定を教えて」
>
> **LM Studio の挙動**:
> 1. LLM が `search_metadata`（引数: `{"query": "ミラ"}`）を呼び出し。
> 2. `novelaide` が未オープンのファイル群も含めて高速全文検索を実行し、マッチした設定箇所のスニペットと要約を返却。
> 3. **AI の返答**: 「ミラは水属性の魔法使いで……」と設定資料に基づいた正確な回答を生成！

---

### ステップ 4: `novelaide` 側のデバッグ支援・可視化機能
外部 AI から指示が届いたとき、エディター側で何が起きているかが分からなければ不安になります。そこで `novelaide` 側にも強力な観測・デバッグ機能を整備しました。

1. **リアルタイムトースト通知**:
   外部 AI からツール呼び出しを受信すると、エディター上部に `🌐 外部AI (MCP): [search_metadata] を実行 (15ms)` のようなトースト通知が即座にポップアップします。
2. **リアルタイム通信ログビューア**:
   設定モーダルの「外部制御 / MCP サーバー連携」セクション内に、直近50件の通信履歴テーブルを新設しました。
   - 呼び出し時刻、実行ツール名、成否（OK / ERROR）、所要時間（ms）が一目で分かります。
   - 各ログ行をクリックすると、渡された **引数（Arguments）** と返却された **実行結果（Result）** をアコーディオン展開して中身をじっくり精査できます。
3. **LLM が理解しやすい要約テキスト（`summaryText`）**:
   単に巨大な JSON 配列を返すだけでは、小規模なローカル LLM が解釈に迷うことがあります。そこで各ツールの返却データに、人間にも LLM にも読みやすい Markdown 要約（`summaryText`）を必ず添付する設計にしました。これにより、ローカル AI でも極めて的確で自然な要約を返せるようになります。

---

## 5. まとめと次回予告

今回の改修により、`novelaide` はエディター内部での AI 執筆支援にとどまらず、**「外部のあらゆる AI エージェントから安全に操作できる小説執筆環境」**へと大きな進化を遂げました！

- **プラグイン新設**: `tauri-plugin-novelaid-mcp`（公式 SSE トランスポート）
- **内部統合**: `externalControlService.ts` により内蔵 AI と外部 MCP を一元化
- **安全設計**: Rust とフロントエンドの二重書き込み制限ガード
- **デバッグ支援**: LM Studio との簡単連携、リアルタイム通信ログ、トースト通知、`summaryText` 添付
- **バージョン更新**: `v0.62.0` → **`v0.63.4`**

LM Studio を手元で起動しておけば、お気に入りのオープンモデルを使って、小説の設定質問や文章校正、プロット相談を完全にローカル環境だけでインタラクティブにデバッグ・執筆できます。

次回もさらなる執筆体験の向上を目指して機能改善を進めていきます。お楽しみに！
