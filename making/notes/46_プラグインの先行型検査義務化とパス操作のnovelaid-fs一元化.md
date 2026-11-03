# 第46回：見逃された型エラーを撃破せよ！プラグインの先行型検査義務化とパス操作の一元化

Tauri 2 を活用した小説執筆エディター **`novelaide`** の開発連載第46回です。

今回は、通常のビルドではスルーされてしまっていた「プラグイン内の型エラー見逃し問題」にメスを入れます。ビルドパイプラインに `tsc --noEmit` を義務付けることで型安全性を強固にするとともに、プラグイン内に残存していたインラインのパス処理を撲滅し、設計原則である `tauri-plugin-novelaid-fs-api` への完全一元化を達成した過程をお届けします。

---

## 1. 潜んでいた型エラーと「なぜか動く」ミステリー

### 1.1 発覚した未定義プロパティ参照

事の発端は、AI執筆パートナーのチャットUIを提供する `AIChatPanel.tsx` の以下のコードでした。

```typescript
// UI ドキュメントコンテキスト（未保存バッファおよび開いているタブ一覧へのリアルタイムアクセス）
const uiDocumentContext: UIDocumentContext = {
  getOpenDocuments: () =>
    openDocuments.map((doc) => ({
      path: doc.path,
      title: doc.name || doc.path.split(/[/\\]/).pop() || '無題',
      isDirty: doc.isDirty ?? false,
    })),
  getActiveDocument: (side?: 'left' | 'right') => {
    const doc = side === 'right' ? activeRightItem : (activeLeftItem || activeRightItem);
    if (!doc) return null;
    return {
      path: doc.path,
      title: doc.name || doc.path.split(/[/\\]/).pop() || '無題',
      content: doc.content || '',
      isDirty: doc.isDirty ?? false,
    };
  },
};
```

一見すると何の変哲もないコードに見えますが、引数として渡されている `ContextDocumentItem` の型定義を確認すると驚くべき事実が判明しました。

```typescript
export interface ContextDocumentItem {
  path: string;
  baseName?: string;
  content: string;
}
```

なんと、`doc.name` も `doc.isDirty` も**型定義に存在していなかった**のです！

### 1.2 なぜランタイムエラーにならずに動作していたのか？

実行時（JavaScript）において、存在しないプロパティへアクセスしても例外（Error）はスローされず、単に `undefined` が返ります。
- `doc.name` は `undefined` と評価され、`||` の右辺にある `doc.path.split(/[/\\]/).pop()` にフォールバックします。
- `doc.isDirty` も `undefined` と評価され、`undefined ?? false` で `false` に解決されます。

結果として、ランタイムエラーを起こすことなく、表面的にはあたかも正常に動作しているかのように見えていたのでした。

さらに、`doc.path.split(/[/\\]/).pop()` というインラインの正規表現による泥臭いパス抽出処理もベタ書きのまま残存していました。

---

## 2. なぜ通常のビルドで見逃されていたのか？

では、なぜ日頃実行している `npm run build` や `npm run build:plugins` でこの型エラーが検出されなかったのでしょうか？
調査を進めると、**ホストアプリ**と**プラグイン側**の2つのレイヤーにまたがる構造的な理由が明らかになりました。

### 2.1 ホストアプリ側（`npm run build`）の盲点
- ホストアプリのビルドは `tsc && vite build` ですが、ルートの `tsconfig.json` では `"include": ["src"]` のみを対象としています。
- プラグインのソースコード（`tauri-plugin-novelaid-ai/guest-js/`）はホストアプリの型チェック対象外です。
- さらに、ホスト側の `tsconfig.json` には `"skipLibCheck": true` が設定されており、参照しているプラグイン（ローカルnpmパッケージ）の型定義不整合もすべてスルーされていました。

### 2.2 プラグイン側（`rollup -c`）の盲点
- 各プラグインの `package.json` のビルドスクリプトは単に `"build": "rollup -c"` となっていました。
- `@rollup/plugin-typescript` は、`noEmitOnError: true` を指定していない場合、型エラーが発生していてもトランスパイル自体は継続し、JavaScriptコード（`dist-js/index.js`）を出力してしまいます。
- そのため、Rollup は警告を出しつつも終了コード `0`（正常終了）でビルドを通過させていたのです。

---

## 3. 解決策：先行型検査の義務化とパス操作の一元化

### 3.1 全プラグインのビルドスクリプトに `tsc --noEmit` を義務化

型エラーを握りつぶしてリリースしてしまう危険を根絶するため、プロジェクト内の全7プラグインの `package.json` を以下のように修正しました。

```json
{
  "scripts": {
    "build": "tsc --noEmit && rollup -c"
  }
}
```

これにより、ビルド時にまず TypeScript 公式コンパイラによる厳格な型チェックが先行実行され、型エラーが1つでもあれば即座に終了コード `1` でビルドを中断・検知できるようになりました。

### 3.2 パス操作をすべて `tauri-plugin-novelaid-fs-api` 経由に統一

第44回でも定めた通り、`novelaide` におけるパス操作はすべて `tauri-plugin-novelaid-fs-api` に集約する設計原則があります。ローカルで独自にパス解析関数をでっち上げるのではなく、プラグインの依存関係に `tauri-plugin-novelaid-fs-api` を追加し、公式提供の `basename` を使用するよう統一しました。

```typescript
import { basename } from 'tauri-plugin-novelaid-fs-api';

// エディタのタブ情報として必要な属性を正式定義
export interface ContextDocumentItem {
  path: string;
  baseName?: string;
  title?: string;
  content: string;
  isDirty?: boolean;
}

// baseName / title を優先し、なければ novelaid-fs の basename で取得
const getDocTitle = (doc: ContextDocumentItem): string => {
  return doc.title || doc.baseName || basename(doc.path) || '無題';
};

const uiDocumentContext: UIDocumentContext = {
  getOpenDocuments: () =>
    openDocuments.map((doc) => ({
      path: doc.path,
      title: getDocTitle(doc),
      isDirty: doc.isDirty ?? false,
    })),
  getActiveDocument: (side?: 'left' | 'right') => {
    const doc = side === 'right' ? activeRightItem : (activeLeftItem || activeRightItem);
    if (!doc) return null;
    return {
      path: doc.path,
      title: getDocTitle(doc),
      content: doc.content || '',
      isDirty: doc.isDirty ?? false,
    };
  },
};
```

---

## 4. 厳格化の成果：全プラグインの健全性を担保

先行型検査を義務化した後、`npm run build:plugins` を実行したところ、`tauri-plugin-novelaid-ai` 内に潜在していた未解決の型エラー（`Persona` 型の別名不整合や `AgentSessionEvent` のプロパティ不一致）もあぶり出され、すべて綺麗に解消することができました。

```bash
> npm run build:plugins

# 全7プラグインが tsc --noEmit を通過し、完全型安全に Rollup バンドル完了！
✔ tauri-plugin-novelaid-fs
✔ tauri-plugin-novelaid-ai
✔ tauri-plugin-restar-git
✔ tauri-plugin-restar-settings
✔ tauri-plugin-novelaid-calibration
✔ tauri-plugin-novelaid-ruby
✔ tauri-plugin-novelaid-metadata
```

---

## 5. まとめ

「動いているから大丈夫」と見過ごされがちな型エラーやローカル処理の蓄積は、後々の大規模リファクタリングで巨大な負債となります。

- **ビルドパイプラインでの二重チェック**: 単なるバンドラーに頼らず、`tsc --noEmit` を挟むことで型安全性の防波堤を築く。
- **ドメインルールの一元化**: パス処理はローカルで手書きせず、常に基盤プラグイン（`novelaid-fs`）を頼る。

この2つの原則を徹底することで、`novelaide` はさらに堅牢なデスクトップアプリへと進化しました。
次回もさらなる品質向上と新機能の実装を進めていきます！
