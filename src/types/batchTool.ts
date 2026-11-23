import React from 'react';

/**
 * バッチ処理対象のファイル情報
 */
export interface BatchFileItem {
  name: string;             // ファイル名 (例: "01_プロローグ.md")
  path: string;             // 絶対パス
  relativePath: string;     // プロジェクト相対パス (例: "novels/01_プロローグ.md")
  extension: string;        // 拡張子 (例: "md")
  selected: boolean;        // 選択フラグ
  size?: number;            // ファイルサイズ（バイト）
  mtimeMs?: number;         // 更新日時
}

/**
 * バッチアクションの実行結果
 */
export interface BatchActionResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors?: { file: string; message: string }[];
}

/**
 * バッチツールアクションのインターフェース
 */
export interface BatchToolAction {
  id: string;
  name: string;
  description: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  component: React.FC<{
    targetDir: string;
    selectedFiles: BatchFileItem[];
    onExecutionComplete: () => void;
  }>;
}
