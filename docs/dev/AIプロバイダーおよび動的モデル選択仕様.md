# AIプロバイダーおよび動的モデル選択仕様書

## 1. 概要

本仕様書は、`novelaide` における AI 執筆支援機能において、**Google Gemini（クラウドAPI）** と **LM Studio（ローカルLLM）** の複数プロバイダーを対等にサポートし、**pi SDK（`@earendil-works/pi-ai`）** のモデルカタログおよび動的フェッチ機能を活用してモデルを選択・切り替え・永続化するための仕様を定義するものです。

---

## 2. プロバイダー別の通信と動的解決仕様

すべてのプロバイダーへのストリーミング通信は、OpenAI 互換の `/chat/completions` SSE プロトコルに一元化して処理されます。

| プロバイダー | エンドポイント (`baseUrl`) | 認証仕様 | モデル動的取得 |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `Authorization: Bearer <API_KEY>` | APIキー疎通による Google REST API (`/v1beta/models`) 取得、または `@earendil-works/pi-ai` 内蔵 `GOOGLE_MODELS` カタログ |
| **LM Studio** | `http://localhost:1234/v1` (設定可) | 不要（任意） | ローカルエンドポイント `GET /v1/models` によるリアルタイム検出 |

---

## 3. 設定管理仕様 (`AiSettingsPlugin`)

設定モーダル（`restar-app-settings`）の「AI執筆アシスタント」タブにて以下の設定を管理します。

| 設定キー | 型 | 初期値 | 説明 |
| :--- | :--- | :--- | :--- |
| `aiLmStudioUrl` | `string` | `"http://localhost:1234/v1"` | LM Studio のエンドポイント |
| `aiGeminiApiKey` | `string` | `""` | Google Gemini API キー（パスワード伏せ字入力） |
| `aiScopedModels` | `string[]` | `["gemini:gemini-2.5-flash", ...]` | チャット画面に表示する有効化モデルのリスト |
| `aiDefaultModel` | `string` | `"gemini:gemini-2.5-flash"` | 新規チャットのデフォルトモデル |

### 最新モデルの自動フェッチ動作
- 設定タブ表示時、および「最新情報に更新」ボタン押下時に、バックグラウンドで `fetchAllAvailableModels` が実行され、LM Studio でロード中の最新モデルや Gemini の最新モデル一覧がチェックボックス形式で提示されます。

---

## 4. チャット画面での選択と永続化仕様

### 4.1 チャットヘッダー（`ChatHeader.tsx`）
- チャット画面ヘッダー右側に、設定された Scoped Models を `<optgroup>` でプロバイダー別にグループ化したドロップダウンセレクターを配置。
- ドロップダウンでの選択変更時、即座にセッションのストリーミング構成（`PiWritingAgentSession.setModel`）が更新され、次回の送信から新モデルが適用されます。

### 4.2 チャットドキュメント（`.ch`）での永続化
チャットファイル（`.ch`）の `metadata.parameters` にモデル情報が保存されます：
```json
{
  "metadata": {
    "parameters": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "useTools": true,
      "useReasoning": true
    }
  }
}
```
ファイルを再オープンした際、保存されたプロバイダーとモデルが自動復元されます。
