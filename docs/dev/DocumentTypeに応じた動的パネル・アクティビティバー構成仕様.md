# DocumentTypeに応じた動的パネル・アクティビティバー構成仕様

## 1. 概要

`novelaide` では、小説本文（`novel`）の執筆だけでなく、プロット・設定資料（`markdown`）、デザイン定義（`css`）、AI相談ログ（`chat`）など多様なドキュメントタイプを編集・閲覧できます。
これに伴い、特定のドキュメント専用の機能（例: 小説作法・助詞重複を解析する校正パネル）を常にアクティビティバーに表示することは、ユーザーの混乱や不適切な指摘、無駄なリソース消費につながります。

本仕様では、エディタのビュープラグイン（`ViewRegistry`）と同様に、サイドパネル（`PanelPlugin`）に対しても **サポートするドキュメントタイプ（`supportedDocumentTypes`）を定義し、アクティブなドキュメントに応じてアクティビティバーのアイコン表示およびサイドパネルの開閉を動的に連動させる仕組み** を規定します。

---

## 2. アーキテクチャとデータ構造

### 2.1 `PanelPlugin` インターフェースの拡張

`src/types/panelPlugin.ts` において、`supportedDocumentTypes` プロパティ（オプショナル）を追加しました。

```typescript
export interface PanelPlugin {
  readonly id: string;
  readonly title: string;
  readonly icon: React.ComponentType<{ size?: number; className?: string }>;
  readonly defaultPlacement: 'left' | 'right';
  readonly allowedPlacements?: ('left' | 'right')[];
  readonly scope: 'project' | 'document';
  
  /**
   * サポートするドキュメントタイプの配列。
   * 省略時（undefined）は、すべてのファイル形式で常にアクティビティバーに表示されます。
   */
  readonly supportedDocumentTypes?: NovelaidDocumentType[];
  
  readonly badge?: () => number | string | null;
  readonly priority?: number;
  readonly component: React.ComponentType<PanelProps>;
}
```

### 2.2 ドキュメントタイプ別サポートマトリクス（現状）

| パネルID | タイトル | `supportedDocumentTypes` | 挙動 |
| :--- | :--- | :--- | :--- |
| `novelaid.panel.files` | ファイルエクスプローラー | 未指定 (`undefined`) | 常に表示（プロジェクト全体） |
| `novelaid.panel.outline` | 目次・アウトライン | 未指定 (`undefined`) | 常に表示 |
| `novelaid.panel.search` | 検索 | 未指定 (`undefined`) | 常に表示 |
| `novelaid.panel.metadata` | 設定資料・メタデータ | 未指定 (`undefined`) | 常に表示 |
| `novelaid.panel.git` | バージョン管理 | 未指定 (`undefined`) | 常に表示 |
| `novelaid.panel.debug` | 形態素・辞書デバッガー | 未指定（設定でトグル可） | 常に表示（開発者用） |
| **`novelaid.panel.calibration`** | **文章校正・文体解析** | **`['novel']`** | **小説本文（`novel`）編集時のみアクティビティバーに出現** |

---

## 3. 動的フィルタリングとパネル連動ロジック

### 3.1 アクティビティバー（`ActivityBar.tsx`）の動的フィルタリング
現在フォーカスされている `activeDocument`（`DocumentState`）の `documentType` を監視し、アイコンのレンダリング一覧から非該当パネルを除外します。

```typescript
const panels = panelRegistry.getPanelsForSide(side).filter((p) => {
  // supportedDocumentTypes が指定されている場合、現在の activeDocument の形式と照合
  if (p.supportedDocumentTypes && p.supportedDocumentTypes.length > 0) {
    if (!activeDocument) return false;
    if (!p.supportedDocumentTypes.includes(activeDocument.documentType)) {
      return false;
    }
  }
  return true;
});
```

### 3.2 サイドペイン（`MainLayout.tsx`）の自動クローズ連動
ユーザーがタブを切り替えた際、現在開いているサイドパネル（左または右）が新しいドキュメントタイプで非対応になった場合、自動的にパネルを閉じます（`activePanelId = null`）。

```typescript
useEffect(() => {
  [leftActivePanelId, rightActivePanelId].forEach((panelId, idx) => {
    if (!panelId) return;
    const panel = panelRegistry.findPanel(panelId);
    if (panel?.supportedDocumentTypes && panel.supportedDocumentTypes.length > 0) {
      const isSupported = activeDocument && panel.supportedDocumentTypes.includes(activeDocument.documentType);
      if (!isSupported) {
        if (idx === 0) setLeftActivePanelId(null);
        else setRightActivePanelId(null);
      }
    }
  });
}, [activeDocument?.documentType, activeDocument?.path, leftActivePanelId, rightActivePanelId]);
```

### 3.3 エディター波線マーカーの安全破棄（`CodeEditor.tsx`）
`documentType !== 'novel'` の場合、校正指摘イベント（`calibration-issues-update`）を受信しても Monaco エディターに波線マーカー（`calibration`）を登録せず、常にクリアします。また、ファイル切り替え時にも既存の校正マーカーを破棄します。

---

## 4. ルビ振り機能の維持仕様

校正パネルおよび校正ルールチェックは `novel` 限定となりますが、**エディター上でのルビ振り機能（`Ctrl+R` / `RubyDialog`）および傍点（`Ctrl+B`）** は、小説構想・Markdown原稿でも広く利用されるため、`novel` と `markdown` の両方で引き続き利用可能です（`EditorSupport.ts` にて担保）。
