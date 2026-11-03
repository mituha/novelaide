# 第43回：DocumentType::Code新設とエディター設定ファイルの直接編集

こんにちは！小説執筆用エディター **`novelaide`** 開発チームです。

長編小説のプロジェクト管理では、本文原稿や設定資料だけでなく、Gitの除外設定を行う `.gitignore` や、novelaide 独自のフォルダ属性ファイル `.novelaidattributes`、あるいは章構成データなどの JSON・YAML といった **各種設定ファイル** がプロジェクト内に共存します。

しかしこれまでの `novelaide` では、非対応ファイルを安全に保護する仕組みが強固になった結果、**「`.gitignore` や `.novelaidattributes` などのエディター動作に関わる設定ファイルまで非対応画面になってしまい編集できない」** というジレンマに直面していました。

今回は、この課題をスマートに解決するため、**新種別 `DocumentType::Code` の導入**、Monaco Editor による**言語自動解決（シンタックスハイライト）**、そして**ドキュメント拡張子情報（`extension`）の一元化設計**についてお届けします！

---

## 1. なぜ「Text」ではなく「Code」なのか？

新しいファイル種別を設計する際、真っ先に候補に挙がるのは「汎用テキスト（`text`）」という名称です。しかし、小説執筆ツールである `novelaide` においては、この命名に大きな落とし穴がありました。

```text
【小説エディター特有のジレンマ】
・novelaide では、拡張子 .txt は「小説本文（novel）」として扱う。
・縦書き文庫プレビュー、小説ルビの独自記法、校正エンジン（Lindera）が適用される。
・もし新種別を「text」にしてしまうと、「.txt は text なのか？ novel なのか？」という
  責務の重複とユーザーの混乱が生じてしまう！
```

そこで、「作家が作品本文として書くプレーンテキスト（`novel`）」と、「エディターやシステム動作のために記述するテキスト・設定・スクリプト（`code`）」という明確な境界線を引くため、新種別を **`DocumentType::Code`** と命名しました。

これにより、小説執筆機能（ルビ・校正・エピソード移動・縦書き）と、コード・設定ファイルのプレーン編集機能の責務が極めて直感的に分離されました。

---

## 2. 拡張子情報（`extension`）の一元化アーキテクチャ

これまでフロントエンドの各画面（ファイル読み込み、画像ビュー、言語判定、非対応画面など）では、それぞれが個別に `path.split('.').pop()` や正規表現を使って拡張子を取り出していました。

この冗長なコードを根絶し、データモデルの段階で拡張子を一元管理するようにアーキテクチャを刷新しました。

```mermaid
graph TD
    classDef rust fill:#1e1e2e,stroke:#f38ba8,stroke-width:1px,color:#cdd6f4;
    classDef ts fill:#1e1e2e,stroke:#89b4fa,stroke-width:1px,color:#cdd6f4;
    classDef comp fill:#181825,stroke:#f59e0b,stroke-width:2px,color:#cdd6f4;

    R_Doc["Rust: NovelaidDocument / NovelaidDirEntry<br>(extension: String)"]:::rust
    -->|IPC (ts-rs 自動生成)| TS_State["TypeScript: DocumentState<br>(extension: string)"]:::ts

    TS_State --> C_Editor["CodeEditor<br>(Monaco 言語自動解決)"]:::comp
    TS_State --> C_Icon["DocumentIcon<br>(拡張子・種別アイコン)"]:::comp
    TS_State --> C_Image["ImagePreview<br>(MIMEタイプ解決)"]:::comp
    TS_State --> C_Unk["UnsupportedFileView<br>(バッジ表示)"]:::comp
```

### ① ドットファイルも完璧に扱える拡張子ロジック
`.gitignore` や `.novelaidattributes` などのドットファイルは、OSや標準ライブラリの `Path::extension()` では拡張子として認識されず `None` になってしまいます。
そこでバックエンド・フロントエンド双方に「ドットファイル名そのものを拡張子識別子（`gitignore` や `novelaidattributes`）として小文字正規化する」ロジックを組み込み、例外のない一貫した扱いを実現しました。

---

## 3. 設定ファイル・コード編集の便利機能

### ① Monaco Editor の言語（Language ID）自動判別
`code` 種別のファイルを開いた際、`extension` に基づいて Monaco Editor のシンタックス定義が自動選択されます。

- **`.json`**: 構文カラー、折りたたみ、JSONスキーマ検証
- **`.css` / `.scss`**: プロパティ補完、カラーピッカー
- **`.yaml` / `.yml`**: インデントガイド、階層認識
- **`.toml` / `.ini` / `.novelaidattributes`**: INI/プロパティ構文カラー
- **`.gitignore` / `.sh` / `.bash`**: シェルスクリプトハイライト
- **`.bat` / `.cmd`**: バッチファイルハイライト
- **`.js` / `.ts`**: JavaScript / TypeScript ハイライト

### ② 余計な Frontmatter の混入を完全遮断（生テキスト保証）
小説原稿（`.txt` / `.md`）ではヘッダーに `---` で囲まれた Frontmatter メタデータ（登場人物設定など）が自動付与されますが、`.gitignore` や `.json` などの設定ファイルに Frontmatter が混入してしまうと構文エラーを引き起こします。

そのため、Rustバックエンドの読み込み・保存処理において、`DocumentType::Code` の場合は **Frontmatter 解析・付与を完全にバイパスし、100% 純粋な生テキスト（RAW text）として保存・読込を行う安全設計** を徹底しました。

### ③ `.novelaidattributes` 照合の最優先化
親ディレクトリに置かれた `.novelaidattributes` のルール照合を全ファイル判定の最上流で行うように改善しました。
これにより、例えば作家が独自に作成した設定ファイルなどを
```text
# .novelaidattributes
*.dict code
*.custom novel
```
のように指定するだけで、エディターが自動的に希望のモードで開いてくれる柔軟性を手に入れました。

---

## 4. まとめ

今回の改修により、`novelaide` は単なる「小説執筆ツール」にとどまらず、**「小説執筆プロジェクトのあらゆるファイルを破綻なく管理・編集できる頼もしい統合ワークスペース（IDE）」** へと大きく進化しました。

1. **`DocumentType::Code` の導入**: 小説（`novel`）とコード・設定（`code`）の境界を明確化。
2. **`.gitignore` や `.novelaidattributes` の快適編集**: Monaco Editor の強力なハイライト・編集支援を享受。
3. **生テキスト保存の徹底**: 設定ファイルやコード構文を絶対に壊さない安全設計。
4. **`DocumentState.extension` によるデータの一元化**: 保守性と拡張性の高い堅牢なコードベース。

次回も、作家の執筆体験をより快適で豊かなものにする改善を進めていきます。どうぞお楽しみに！
