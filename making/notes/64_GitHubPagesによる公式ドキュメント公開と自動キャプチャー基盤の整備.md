# 第64回：GitHub Pagesによる公式ドキュメント公開と自動キャプチャー基盤の整備

小説執筆用デスクトップIDE **`novelaide`**（コードネーム: `novelaid-e`）の開発メイキング連載第64回です。

今回は、執筆者向けのユーザーマニュアルや開発者仕様書を **GitHub Pages でWebサイトとして公開** する仕組みと、アプリ内からの閲覧導線、そしてマニュアルの視覚的理解を助ける **Playwright によるスクリーンショット自動キャプチャー環境の整備** について解説します。

---

## 1. 課題と背景

先行の `novelaid-editor` では、GitHub Pages を通じてユーザーマニュアルや開発資料をWeb上で公開していました。`novelaide` でも同様にWeb公開を行う必要がありましたが、以下の2つの大きな課題がありました。

1. **コンテキスト分離ルールとの両立**:
   本プロジェクトでは、「`docs/`（公開ドキュメント）」と「`making/`（システム開発・運用の記録）」を物理的に完全に分離する運用ルールを定めています。note.com に連載しているメイキング記事（`making/notes/`）もWeb公開したいものの、ファイルを `docs/` 配下へ移動させてしまうと、日々の作業ログやAIスキルの動作基盤が崩れてしまいます。
2. **マニュアルの視覚化とキャプチャー更新コスト**:
   機能追加のたびにマニュアルのスクリーンショットを手動で撮り直すのは膨大な手間がかかります。継続的かつ自動的に最新のUIをキャプチャーできる環境が不可欠でした。

---

## 2. GitHub Actions による動的マージデプロイ

### 2.1 ローカルの配置は変えずにWeb上で一体公開
GitHub Pages の標準機能（リポジトリのブランチ直結）では、指定したディレクトリ外のファイル（`making/notes/` など）を参照することができません。

そこで、**GitHub Actions による GitHub Pages デプロイ（`.github/workflows/pages.yml`）** を採用しました。
CI ワークフローの実行時に一時ディレクトリ `public_site/` を作成し、そこに `docs/` と `making/notes/` を動的にマージしてから Jekyll ビルドを行います。

```mermaid
flowchart LR
    subgraph LocalRepo ["ローカルリポジトリ (完全分離)"]
        D["docs/<br/>(index.md, manual/, dev/)"]
        M["making/notes/<br/>(連載記事, images/)"]
    end

    subgraph CI ["GitHub Actions (pages.yml)"]
        P["public_site/<br/>├── index.md<br/>├── manual/<br/>├── dev/<br/>└── notes/ (← making/notes)"]
        J["Jekyll Build"]
    end

    subgraph Pages ["GitHub Pages (公開サイト)"]
        Web["https://mituha.github.io/novelaide/<br/>├── manual/<br/>├── dev/<br/>└── notes/"]
    end

    D --> P
    M --> P
    P --> J --> Web
```

これにより、**リポジトリ内のディレクトリ構造やコンテキスト分離ルールを一切崩すことなく**、Web上では `https://mituha.github.io/novelaide/notes/` としてメイキング連載記事をシームレスに公開できるようになりました。

---

## 3. アプリ内からのドキュメント閲覧導線

ユーザーが執筆中にいつでもマニュアルを参照できるよう、アプリ内にWebマニュアルへのリンクを配置しました。

1. **左アクティビティバー最下部（ヘルプアイコン）**:
   テーマ切り替えボタンや環境設定ボタンの並びに `HelpCircle` アイコンを設置。クリック時に `@tauri-apps/plugin-opener` を通じて外部ブラウザで公式Webマニュアル（`https://mituha.github.io/novelaide/manual/`）をワンクリックで開けます。
2. **環境設定「全般・更新」タブ**:
   「公式ドキュメント・関連リンク」セクションを新設し、「Webマニュアル」「メイキング連載」「最新リリース」の外部リンクボタンを配置しました。

---

## 4. Playwright によるスクリーンショット自動生成の高速化

既存の `scripts/capture-screenshots.js` を見直し、以下の最適化を行いました：

- **ダークテーマ特化による高速化**:
  ライト・セピアの撮影ループを省き、ダークテーマのみに限定することで、撮影所要時間を大幅に短縮。
- **バッチ処理ツールの自動撮影追加**:
  前回新設したバッチ処理ツール（`BatchToolsPanel`）を自動展開してキャプチャーし、`docs/manual/images/18_バッチ処理ツール_ダークモード.png` を生成。
- **マニュアル本文への自動埋め込み**:
  `docs/manual/バッチ処理ツールの使い方.md` に画像を配置し、操作手順の視覚的理解を向上させました。
- **npm スクリプトの整備**:
  `npm run capture:screenshots` を実行するだけで、全主要機能のダークモードスクリーンショットが自動生成されます。

---

## 5. まとめ

* **GitHub Pages 総合ポータルの新設**: Cayman テーマを用いた美しいドキュメントサイトを開設。
* **動的マージアーキテクチャ**: コンテキスト分離ルールを守ったまま、メイキング連載をWeb公開。
* **アプリ内連携と自動撮影**: いつでもマニュアルを引ける導線と、マニュアルを継続的に自動生成できる開発環境が完成しました。
