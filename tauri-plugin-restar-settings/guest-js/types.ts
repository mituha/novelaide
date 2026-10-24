import type { ReactNode } from 'react';

/**
 * 設定タブコンポーネントに渡されるプロパティ
 */
export interface SettingTabProps {
  /** 現在の全設定値 */
  settings: Record<string, any>;
  /** 設定値を更新する関数 */
  updateSetting: <T>(key: string, value: T) => void;
  /** 設定値をデフォルト値にリセットする関数 */
  resetSetting: (key: string) => void;
  /** 検索入力バーに入力された検索クエリ文字列 */
  searchQuery: string;
}

/**
 * 設定タブプラグインのインターフェース
 */
export interface SettingTabPlugin {
  /** 一意なタブ識別子 (例: 'general', 'appearance', 'editor') */
  id: string;
  /** タブの表示名 (例: '一般設定', '外観・テーマ') */
  title: string;
  /** アイコン識別名 (Lucideアイコン等) */
  icon?: string;
  /** サイドバーでの表示順序 (昇順) */
  order: number;
  /** 検索フィルター用の追加キーワード */
  keywords?: string[];
  /** このプラグインが提供する設定キーとデフォルト値 */
  defaultValues: Record<string, any>;
  /** 設定UIコンポーネントを描画する関数 */
  render: (props: SettingTabProps) => ReactNode;
}
