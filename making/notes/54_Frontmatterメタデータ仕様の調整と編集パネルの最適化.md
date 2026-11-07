# 第54回：目次の自動生成を見据えて！Frontmatterメタデータ仕様の調整と編集パネルの最適化

こんにちは！ 小説執筆用エディター **`novelaide`**（コードネーム: `novelaid-e`）の開発メイキング連載第54回です。

長編小説の執筆が進むにつれて、章やエピソード、キャラクターシート、世界観・地名資料、プロットなどが大量のファイルとして階層化されていきます。
今回は、将来的に各フォルダ内のファイルから目次や一覧カタログを自動生成する **`index.md` 自動生成機能** を見据え、コアメタデータ仕様（`title`, `type`, `description`）の調整と、エディター右ペインのメタデータ編集パネル（`MetadataPanel`）のUI改修を行いました。

---

## 1. 背景：なぜ index.md の自動生成を見据えるのか？

大規模な作品構造を持つプロジェクトでは、フォルダごとにその配下のファイルをまとめた `index.md` が存在すると、全体の見通しが格段に良くなります。

```text
my-novel/
├── 01_第一章/
│   ├── index.md           <-- エピソード一覧（タイトル・概要・種別）
│   ├── 01_目覚め.md
│   └── 02_旅立ち.md
└── 99_設定資料/
    ├── index.md           <-- 登場人物や舞台の一覧カタログ
    ├── chara_reo.md
    └── loc_capital.md
```

各ファイルの冒頭にある **YAML Frontmatter** から必要な情報を抽出すれば、作家自身がいちいちリンクや概要を手書き更新することなく、常に最新の目次を自動構築・同期することが可能になります。

### ユーザーからのリクエスト（作業ログより）

```text
/plan 将来的なindex.mdの自動生成機能の追加に伴うメタデータ仕様の調整。
コンセプト的にはOKF同様ですが、現在のところOKFに対応するわけではありません。
単に、index.mdの自動生成を視野にいれた一部メタデータ仕様、および、編集用パネルの調整のみ行います。
関連するのは、
* type
* title
* description (現在複数行入力ですが、１行のみとします)
となります。
```

---

## 2. コアメタデータの役割と設計判断

`index.md` の自動生成において中核となる3つのフィールドについて、次のように設計を定めました。

| フィールド名 | 型 | 入力形式 | 用途と設計判断 |
| :--- | :--- | :--- | :--- |
| **`title`** | `string` | 1行 input | ドキュメントの正式名称・話数。`index.md` の見出しやリンク表記（`[タイトル](./file.md)`）に使用。 |
| **`type`** | `string` | 1行 input（datalist候補付き） | ドキュメントの分類種別。`index.md` 生成時の抽出フィルタリングに使用。<br>オプショナル・自由入力型を採用し、未入力時はキーを出力しない（既存資産との完全な互換性を確保）。 |
| **`description`** | `string` | 1行 input | ドキュメントの要約・1行説明。`index.md` のリスト説明文やテーブル概要列に配置。<br>一覧での視認性と機械可読性を最優先するため、従来の複数行から **1行入力** へ最適化。 |

### ユーザー独自の Frontmatter を絶対に壊さない原則

Frontmatter はユーザーが自由にプロパティを定義できる領域です。
そのため、「以前使っていた `summary` などのキーをシステムが勝手に削除したり、`description` へ強制移行・統合したりしない」という非破壊の運用方針を徹底しました。

また、編集パネル上でフィールドを空（全削除）にした場合は、Frontmatter に `title: ""` や `type: ""` などの空キーを残さず、キー自体をクリーンに削除するロジックを組み込みました。

---

## 3. UI実装：MetadataPanel のブラッシュアップ

React側のメタデータ編集パネル（`src/components/Metadata/MetadataPanel.tsx`）を改修しました。

```tsx
// src/components/Metadata/MetadataPanel.tsx より抜粋
<div className="space-y-3">
  {/* タイトル (1行) */}
  <div>
    <label className="text-xs font-semibold opacity-70">タイトル</label>
    <input
      type="text"
      value={metadata.title ?? ''}
      onChange={(e) => handleChange('title', e.target.value)}
      placeholder="ドキュメントのタイトル"
      className="w-full text-xs px-2.5 py-1.5 rounded border ..."
    />
  </div>

  {/* 種別 (1行・datalistサジェスト付き自由入力) */}
  <div>
    <label className="text-xs font-semibold opacity-70">種別 (type)</label>
    <input
      type="text"
      list="meta-type-presets"
      value={metadata.type ?? ''}
      onChange={(e) => handleChange('type', e.target.value)}
      placeholder="例: chapter, character, memo..."
      className="w-full text-xs px-2.5 py-1.5 rounded border ..."
    />
    <datalist id="meta-type-presets">
      <option value="chapter" label="本編章・エピソード" />
      <option value="character" label="登場人物・設定シート" />
      <option value="location" label="地名・施設・舞台設定" />
      <option value="plot" label="プロット・構成案" />
      <option value="index" label="目次・インデックス" />
      <option value="memo" label="執筆メモ・アイデア" />
    </datalist>
  </div>

  {/* 概要 (1行) */}
  <div>
    <label className="text-xs font-semibold opacity-70">概要 (1行)</label>
    <input
      type="text"
      value={metadata.description ?? ''}
      onChange={(e) => handleChange('description', e.target.value)}
      placeholder="ドキュメントの要約・1行説明"
      className="w-full text-xs px-2.5 py-1.5 rounded border ..."
    />
  </div>
</div>
```

---

## 4. 共通ドキュメントリポジトリへの仕様同期

本プロジェクトのルールとして、開発仕様や設計メモは本リポジトリの `docs/dev/` だけでなく、参照用共通ドキュメントリポジトリである **`novelaid-editor-docs`** にも漏れなく反映します。

- 本リポジトリ:
  - `docs/dev/メタデータおよびインデックス自動生成仕様.md`（新規作成）
  - `docs/dev/メタデータ管理およびFrontmatter編集仕様.md`（3.2節更新）
- 共通ドキュメントリポジトリ（`novelaid-editor-docs`）:
  - `docs/dev/メタデータ管理およびFrontmatter編集仕様.md`（3.2節更新・コミット完了）

---

## 5. まとめと次回予告

将来の機能拡張を見据えた「データの構造化」と「UIの最適化」を完了しました。
メタデータがコンパクトな1行形式に統一され、種別（`type`）の分類補助が備わったことで、作家はストレスなくファイルに属性を付与できるようになりました。

次回は、このメタデータを活用したさらなる執筆支援や、プロジェクト構造の強化へと進んでいきます！
