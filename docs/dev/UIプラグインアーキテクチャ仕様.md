# 統合UIプラグインアーキテクチャ実装仕様書

## 1. 概要とアーキテクチャ方針

本ドキュメントは、**`novelaide`** における **主要UI要素（左右ペイン、パネル、中央ドキュメントビュー、下部ステータスバー）をすべてプラグインとして分離・拡張可能にする「統合UIプラグイン基盤」** の実装仕様を定義するものです。

### 設計方針
1. **左右ペインの完全な対称性（Symmetry）**:
   - 左ペインと右ペインは同一のコンテナコンポーネント（`SidePane`）で描画。
   - 違いは `paneSide: 'left' | 'right'` の位置と、そこに登録・配置されるパネルの役割（左: プロジェクト全体、右: 開いているドキュメント個別）のみ。
2. **パネルのプラグイン化 (`PanelPlugin`)**:
   - `PanelRegistry` を通じて、ファイルツリーや見出しアウトライン、Git履歴などを動的マウント。
3. **ステータスバーのプラグイン化 (`StatusBarItemPlugin`)**:
   - `StatusBarRegistry` を通じて、文字数・原稿用紙換算、テーマ切替、ペイン開閉トグルなどを柔軟に配置。

---

## 2. ディレクトリ構成

```text
src/
├── types/
│   ├── document.ts         # DocumentState, DocumentViewMode, DocumentType
│   ├── viewPlugin.ts       # DocumentViewProps, DocumentViewPlugin (導入済み)
│   ├── panelPlugin.ts      # PanelProps, PanelPlugin
│   └── statusBarPlugin.ts  # StatusBarItemProps, StatusBarItemPlugin
├── core/
│   ├── viewRegistry/       # ドキュメントビューレジストリ (導入済み)
│   ├── panelRegistry/      # パネルレジストリ (新規)
│   │   ├── PanelRegistry.ts
│   │   └── index.ts
│   └── statusBarRegistry/  # ステータスバーレジストリ (新規)
│       ├── StatusBarRegistry.ts
│       └── index.ts
├── plugins/
│   ├── views/              # ドキュメントビュープラグイン群 (導入済み)
│   ├── panels/             # パネルプラグイン群
│   │   ├── FileExplorerPanelPlugin.tsx # 左ペイン: ファイルツリー
│   │   └── OutlinePanelPlugin.tsx      # 右ペイン: 見出しアウトライン
│   └── status/             # ステータスバーアイテムプラグイン群
│       ├── HomeStatusPlugin.tsx
│       ├── LeftToggleStatusPlugin.tsx
│       ├── RightToggleStatusPlugin.tsx
│       ├── CharCountStatusPlugin.tsx
│       └── ThemeStatusPlugin.tsx
└── components/
    └── Layout/
        ├── ActivityBar.tsx     # 左右対応アクティビティバー
        ├── SidePane.tsx         # 左右対称サイドペインコンテナ
        ├── StatusBar.tsx        # レジストリ連動ステータスバー
        └── MainLayout.tsx       # 統合レイアウト
```

---

## 3. 型定義

### 3.1 `PanelPlugin` (`src/types/panelPlugin.ts`)
```typescript
import React from 'react';
import { DocumentState } from './document';

export interface PanelProps {
  paneSide: 'left' | 'right';
  activeDocument: DocumentState | null;
  onClose?: () => void;
}

export interface PanelPlugin {
  readonly id: string;
  readonly title: string;
  readonly icon: React.ComponentType<{ size?: number; className?: string }>;
  readonly defaultPlacement: 'left' | 'right';
  readonly allowedPlacements?: ('left' | 'right')[];
  readonly scope: 'project' | 'document';
  readonly badge?: () => number | string | null;
  readonly priority?: number;
  readonly component: React.ComponentType<PanelProps>;
}
```

### 3.2 `StatusBarItemPlugin` (`src/types/statusBarPlugin.ts`)
```typescript
import React from 'react';
import { DocumentState } from './document';

export interface StatusBarItemProps {
  activeDocument: DocumentState | null;
}

export interface StatusBarItemPlugin {
  readonly id: string;
  readonly alignment: 'left' | 'right';
  readonly priority: number;
  readonly isVisible?: (activeDocument: DocumentState | null) => boolean;
  readonly component: React.ComponentType<StatusBarItemProps>;
}
```

---

## 4. 組み込みプラグインと役割分担

### 4.1 パネル一覧
| ID | 名称 | デフォルト配置 | スコープ | コンポーネント |
|---|---|---|---|---|
| `novelaid.panel.files` | ファイル | `left` | `project` | `FileExplorer` |
| `novelaid.panel.outline` | アウトライン | `right` | `document` | `DocumentOutline` |

### 4.2 ステータスバー一覧
| ID | 名称 | 配置 | 優先度 | コンポーネント |
|---|---|---|---|---|
| `novelaid.status.home` | ホーム | `left` | 100 | ホームボタン |
| `novelaid.status.leftToggle` | 左サイドバー切替 | `left` | 90 | 左ペイン開閉トグル |
| `novelaid.status.docType` | ドキュメント種別 | `left` | 80 | ファイル名 & 種別タグ |
| `novelaid.status.charCount` | 文字数カウント | `right` | 100 | 文字数・原稿用紙換算 & 詳細分析ポップアップ |
| `novelaid.status.theme` | テーマ切替 | `right` | 80 | ダーク/ライト/セピア切替 |
| `novelaid.status.rightToggle` | 右サイドバー切替 | `right` | 70 | 右ペイン開閉トグル |

---

## 5. 実装ステップ計画

1. **Step 1: 型定義とレジストリ基盤の作成**
   - `src/types/panelPlugin.ts`
   - `src/core/panelRegistry/PanelRegistry.ts` & `index.ts`
   - `src/types/statusBarPlugin.ts`
   - `src/core/statusBarRegistry/StatusBarRegistry.ts` & `index.ts`
2. **Step 2: 既存・新規パネルのプラグイン化**
   - `src/plugins/panels/FileExplorerPanelPlugin.tsx`
   - `src/plugins/panels/OutlinePanelPlugin.tsx`（Markdown/小説の見出し抽出アウトライン）
3. **Step 3: 左右対称ペイン（`SidePane`）とアクティビティバー（`ActivityBar`）の改修**
   - 左右両ペインに対応し、アクティブパネルの開閉を管理。
4. **Step 4: ステータスバーのプラグイン化**
   - `src/components/Layout/StatusBar.tsx` をレジストリ連動へリファクタリング。
5. **Step 5: 動作検証とスクリーンショット撮影**
