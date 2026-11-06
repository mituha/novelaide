# 第50回：プロバイダー切り替えの罠を突破せよ！環境変数からのAPIキー安全取得と設定UI連携

こんにちは！ 小説執筆用エディター **`novelaide`**（コードネーム: `novelaid-e`）の開発メイキング連載第50回です。

記念すべき第50回を迎えた今回は、デスクトップアプリ開発において避けては通れない**「AIモデル切り替えの落とし穴」**と**「APIキーを安全に扱うためのセキュリティ設計」**の実装ドラマをお届けします。

ローカルLLM（LM Studio）とクラウドLLM（Google Gemini）を自由に切り替えて執筆を支援できるようにしたはずが、実際に触ってみると謎のエラーメッセージに遭遇することになりました。

---

## 1. 「Geminiに切り替えたのに、LM Studioのエラーが出る？」

エディターの設定画面からモデルを「Google Gemini 2.5 Flash」に切り替え、チャットを送信したところ、開発者から次のような相談が寄せられました。

```markdown
> モデルの切り替えが上手く行っていない、もしくは、LM Studio以外での処理時におかしい。
> Geminiに切り替え後の会話で、「(※LM Studioへの接続が検出されなかったため」のメッセージが出るため、
> 余分なチェックが入っている可能性もあります。
> なお、/model ではGeminiを返します。
```

画面上では確かに「Gemini」が選択されていると表示されているのに、返答にはローカルLLM（LM Studio）のエラーが混ざる……。  
コードを徹底調査したところ、**3つの重層的な落とし穴**が存在することが判明しました。

### 落とし穴 ①：Pi SDK の内部フィールド名の食い違い
セッション管理クラス `PiWritingAgentSession` において、モデル切り替え時にストリーム関数を更新するコードがありました。
```typescript
// 修正前の誤ったコード
(this.agent as any).streamFn = newStreamFn;
```
しかし、Pi SDK（`pi-agent-core`）の `Agent` インスタンス内部で保持されている正規のプロパティ名は `streamFunction` でした。プロパティ名のタイポにより、初期化時に設定された「LM Studio用の古いストリーム関数」が破棄されず、ずっと裏で動き続けていたのです。

### 落とし穴 ②：デフォルト Base URL の盲目的な代入
```typescript
// 修正前のコード
const baseUrl = this.options.baseUrl || DEFAULT_LM_STUDIO_URL;
```
Gemini などのクラウドプロバイダーは専用の公式APIエンドポイントへアクセスするため、ローカル用の `baseUrl` は指定しません（`undefined`）。
しかし上記コードでは、`baseUrl` が空の場合に問答無用で `http://localhost:1234`（LM StudioのデフォルトURL）が代入されていました。結果として、Gemini 向けのリクエストが LM Studio に送信されていたのです。

### 落とし穴 ③：大雑把なエラーハンドリング
通信エラー時の catch 節で、プロバイダー種別を問わずに「LM Studioへの接続が検出されなかったため…」という固定メッセージを出力していました。
HTTP 401（認証エラー）や 400（リクエスト不正）の詳細なレスポンス本文（`res.text()`）を解析し、プロバイダーに応じた正確なエラー案内を表示するように修正しました。

---

## 2. APIキー入力の手間を省きたい！「環境変数からの自動補完」

プロバイダー切り替えのバグを解消した後、開発者から次のような質問が上がりました。

```markdown
> APIキーが入っていない場合に環境変数から取得できる？
> Piではそうなっているのでは？
```

普段からターミナルや開発環境で作業している場合、`GEMINI_API_KEY` などの環境変数はすでにPC（OS）に設定されていることが多く、アプリの設定画面を開くたびに長大なキーをコピペするのは手間がかかります。

しかし、デスクトップアプリ（WebView / フロントエンド）からOSの環境変数を読み取る際には、**重大なセキュリティ上の懸念**が生じます。

---

## 3. デスクトップアプリのセキュリティ鉄則：ホワイトリスト型 Tauri コマンド

```markdown
> セキュリティ的な問題は？
```

### なぜフロントエンドから無制限に環境変数を読んではいけないのか？
ブラウザ環境（レンダラープロセス）に対して「任意の環境変数を読み取る権限」を安易に開放してしまうと、万が一外部スクリプトの混入やXSS等の脆弱性が発生した際に、AWSの認証キーやSSH鍵のパス、個人情報といったPC内の重要データが一挙に盗難されるリスクが生じます。

そこで novelaide では、**「ホワイトリスト型 Tauri Rust バックエンドコマンド」** を設計・実装しました。

```mermaid
flowchart TD
    Front["フロントエンド\n(TypeScript)"]
    Rust["Tauri バックエンド\n(Rust / commands.rs)"]
    Env["OS 環境変数"]

    Front -->|"ai_get_env_api_key('gemini')"| Rust
    
    subgraph Whitelist["厳格なホワイトリスト判定"]
        Check{"プロバイダー照合"}
        Check -->|"gemini / google"| K1["GEMINI_API_KEY\n(or GOOGLE_API_KEY)"]
        Check -->|"openai"| K2["OPENAI_API_KEY"]
        Check -->|"anthropic"| K3["ANTHROPIC_API_KEY"]
        Check -->|"その他"| Err["拒否: None を返却"]
    end

    Rust --> Whitelist
    K1 --> Env
    K2 --> Env
    K3 --> Env
    Rust -->>|"対象キーのみ安全に返却"| Front
```

### Rust 側の実装（抜粋）
```rust
#[tauri::command]
pub fn ai_get_env_api_key(provider: String) -> Result<Option<String>, String> {
    let key_names: &[&str] = match provider.to_lowercase().as_str() {
        "gemini" | "google" => &["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "openai" => &["OPENAI_API_KEY"],
        "anthropic" => &["ANTHROPIC_API_KEY"],
        _ => return Ok(None), // 未許可のプロバイダーは一切アクセス不可
    };

    for &name in key_names {
        if let Ok(val) = std::env::var(name) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    Ok(None)
}
```

フロントエンド側は、手動設定されたAPIキーが空の場合にのみこのバックエンドコマンドを呼び出し、OSに設定済みのキーを自動ロードします。
これにより、**最高水準のセキュリティを保ったまま、入力の手間をゼロにする快適な執筆体験**を実現しました。

---

## 4. まとめと次回予告

今回は、マルチプロバイダーAI連携における落とし穴の完全解消と、セキュアな環境変数連携を構築しました。

* **モデル切り替え修復**: Pi SDK の内部フィールド（`streamFunction`）の正常更新と Base URL 判定の厳格化。
* **正確なエラー案内**: 固定メッセージを撤廃し、HTTPステータスやレスポンスボディを解析。
* **ホワイトリスト型環境変数取得**: Tauri Rust バックエンドで許可されたAPIキー名のみを安全に提供。

AI執筆エージェントの機能が充実してきたところで、次は**「作品を執筆する作家の手元にアプリをどう届けるか？」**というインストーラーの課題に向き合います。

次回は、Windows向けインストーラー（NSIS / WiX）の完全日本語化対応と、レジストリを汚さない安全・クリーンな配布設計をお届けします！
