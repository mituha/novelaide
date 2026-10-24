import React from 'react';
import { NovelaidDocumentType, DocumentViewMode } from './document';

/**
 * ビューコンポーネントに渡される標準プロパティ
 */
export interface DocumentViewProps {
  /** ドキュメントパス */
  path: string;
  /** ドキュメントのテキスト内容 */
  content: string;
  /** ドキュメント種別 */
  documentType: NovelaidDocumentType;
  /** 読み取り専用かどうか (プレビューやリーダーでは true) */
  isReadOnly?: boolean;
  /** テキスト内容変更時のコールバック */
  onChangeContent?: (newContent: string) => void;
  /** 左右どちらのペインに配置されているか ('left' | 'right') */
  paneSide?: 'left' | 'right';
  /** 追加メタデータ (YAMLフロントマターなど) */
  metadata?: Record<string, any>;
}

/**
 * ツールバーコンポーネントに渡されるプロパティ
 */
export interface DocumentToolbarProps {
  path: string;
  viewMode: DocumentViewMode;
  paneSide?: 'left' | 'right';
  documentType: NovelaidDocumentType;
}

/**
 * ビュープラグイン定義インターフェース
 */
export interface DocumentViewPlugin {
  /** 一意なプラグイン識別子 (例: 'novelaid.view.novel.preview') */
  readonly id: string;
  /** 表示名 (ツールバーやタブ等で表示されるラベル) */
  readonly name: string;
  /** 対応する表示モード ('editor' | 'reader' | 'preview' | 'canvas') */
  readonly viewMode: DocumentViewMode;
  /** サポートするドキュメント種別配列 */
  readonly supportedDocumentTypes: NovelaidDocumentType[];
  /** 優先度 (同一条件で競合した場合に高い値が優先。通常 0) */
  readonly priority?: number;

  /** 描画を行うReactコンポーネント */
  readonly component: React.ComponentType<DocumentViewProps>;

  /** ツールバーに追加配置するアクションコンポーネント (任意) */
  readonly toolbarComponent?: React.ComponentType<DocumentToolbarProps>;
}
