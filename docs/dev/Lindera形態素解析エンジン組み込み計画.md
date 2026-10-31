# Lindera 形態素解析エンジン組み込み計画

## 1. 概要

本ドキュメントは、`tauri-plugin-novelaid-calibration` に対する純 Rust 製形態素解析エンジン **`Lindera`**（v6.x）の組み込みアーキテクチャ、トラブル防止策、および段階的導入手順を定義するものである。

現行の `novelaid-editor`（Electron版）で使用していた `kuromoji`（Node.js）からの完全な移行を達成し、外部ランタイム依存ゼロ・ミリ秒単位の超高速ローカル形態素解析基盤を確立する。

---

## 2. ライブラリ選定とクレート仕様

### 2.1. 採用クレートとバージョン
* **クレート**: `lindera = { version = "6", features = ["embed-ipadic"] }`
* **辞書**: IPADIC 内蔵（`embed-ipadic`）
* **対応 Rust バージョン**: 1.88 以上（本環境は `rustc 1.94.1` であり完全適合）

### 2.2. 選定理由とメリット
1. **完全オフライン・外部辞書配布トラブルゼロ**:
   - `embed-ipadic` により辞書バイナリが実行ファイルに静的リンクされるため、OSごとのファイルパス差異やインストーラーでの辞書配置漏れリスクが原理的に排除される。
2. **高速性とメモリ効率**:
   - 形態素解析処理は数万文字の原稿でも数ミリ秒〜十数ミリ秒で完了し、Monaco Editor のタイピングやタブ切り替えを妨げない。
3. **小説執筆に不可欠な形態素情報の取得**:
   - 表層形（`surface`）、品詞体系（`pos`）、原形（`base_form`）、読み（カタカナ `reading`）、発音（`pronunciation`）が網羅的に得られる。
4. **CSV 形式によるユーザー辞書実行時追加の公式サポート**:
   - 設定資料（登場人物・造語）から `表層形,カスタム名詞,読み` の3列 CSV を動的生成し、Segmenter に渡すことが可能。

---

## 3. 組み込みにおける課題と安全設計（トラブル防止策）

大型形態素解析クレートを Tauri デスクトップ環境に組み込む際のリスクを洗い出し、以下の対策を徹底する。

| 課題・リスク | 発生原因 | 対策・安全設計 |
| :--- | :--- | :--- |
| **辞書ロードのオーバーヘッド** | IPC リクエストのたびに辞書を展開すると数十〜数百 ms の遅延が発生する | アプリ起動時（`setup`）に1度だけ辞書をロードし、`NovelaidCalibration` 内に `Arc<Segmenter>` として永続キャッシュ（シングルトン化）。 |
| **マルチスレッド並行アクセス** | フロントエンドから複数の校正・トークン化要求が並行して届く | `Segmenter` を `Arc<RwLock<Segmenter>>` で保持し、スレッドセーフに並行読み取り（`read()`）を許可。 |
| **ユーザー辞書の動的更新競合** | 設定資料の編集によりユーザー辞書を再生成する際のリソース競合 | `write()` ロックにより安全に新しい `Segmenter` インスタンスへアトミック置換。 |
| **バイナリサイズとコンパイル時間** | 辞書データの静的リンクによるビルド時間の長期化 | `tauri-plugin-novelaid-calibration` 側で独立して `cargo test` を行い、本体（`src-tauri`）のコンパイルに影響を与えずに単体検証を実施。 |

---

## 4. 内部アーキテクチャ設計

```mermaid
flowchart TD
    subgraph PluginState["NovelaidCalibration (Tauri State)"]
        Lock["Arc<RwLock<Segmenter>>"]
        Dict["Embedded IPADIC (load_dictionary)"]
        UserDict["Option<UserDictionary> (動的CSV)"]
    end

    subgraph Commands["IPC Commands (commands.rs)"]
        C1["check_text(text)"]
        C2["tokenize_text(text)"]
        C3["get_ruby_candidates(text)"]
        C4["reload_user_dictionary()"]
    end

    subgraph Rules["ルールエンジン (Rust)"]
        R1["小説作法 (会話文末句点・三点リーダー偶数)"]
        R2["助詞連続 ('の' 3回以上)"]
        R3["ら抜き言葉 (上一段/カ変未然形 + れる)"]
        R4["漢字の開き (形式名詞/副詞)"]
        R5["文字種比率・頻出語集計"]
    end

    Lock --> Dict
    Lock --> UserDict
    Commands -->|read lock| Lock
    C1 --> Rules
    C2 --> Lock
    C3 --> Lock
```

### 4.1. トークン情報のマッピング仕様
Lindera の `token.details`（IPADIC）から novelaide 共通の `TokenInfo` への変換：
* `surface`: `token.text`
* `pos`: `token.details[0..4]` をカンマ結合（例: `名詞,固有名詞,人名,一般`）
* `base_form`: `token.details[6]`
* `reading`: `token.details[7]`（カタカナ）
  - ルビ用途には、カタカナをひらがなに変換する高速ユーティリティ（`kana_to_hira`）を適用。

---

## 5. 段階的導入計画（Implementation Roadmap）

安全性を最大化するため、以下の3段階でステップ・バイ・ステップに進める。

### フェーズ 1: 単体クレートでのコンパイル＆動作検証
1. `tauri-plugin-novelaid-calibration/Cargo.toml` に `lindera = { version = "6", features = ["embed-ipadic"] }` を追加。
2. プラグイン単体で `cargo check` および単体テスト（`Segmenter` による形態素解析テストコード）を実行。
3. IPADIC 辞書の展開と基本トークン分割が正常に完了することを確認。

### フェーズ 2: プラグイン本体（`desktop.rs`）へのエンジン組み込み
1. `NovelaidCalibration` に `Arc<RwLock<Segmenter>>` を導入。
2. `tokenize_text` をモックから Lindera 実装へ切り替え。
3. `get_ruby_candidates` を本実装（本文中の漢字語句＋Lindera読みからひらがなルビを生成）。
4. フロントエンド校正パネルの「ルビ支援」「文体・比率」タブで実データ表示を疎通確認。

### フェーズ 3: 形態素解析ベースの小説校正ルール本実装
1. 助詞連続検出（トークン列中の助詞「の」の出現間隔判定）。
2. ら抜き言葉検出（動詞形態素の活用形パターン判定）。
3. 形式名詞・漢字の開き判定（「事」「時」「物」等の品詞が形式名詞・非自立である場合の検出）。
4. フロントエンドでの各指摘の適用（Monaco Editor 連動）テスト。
