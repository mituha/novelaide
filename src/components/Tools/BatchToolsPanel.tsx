import React, { useState, useCallback } from 'react';
import { Wrench, FileCode, Layers } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { BatchFileSelector } from './BatchFileSelector';
import { BatchExtensionChanger } from './actions/BatchExtensionChanger';
import { BatchFileItem, BatchToolAction } from '../../types/batchTool';
import './BatchToolsPanel.css';

// 登録されているバッチツールアクション一覧
const AVAILABLE_ACTIONS: BatchToolAction[] = [
  {
    id: 'extension-changer',
    name: '一括拡張子変更',
    description: 'フォルダ内ファイルの拡張子 (.md ⇔ .txt など) を一括リネーム',
    icon: FileCode,
    component: BatchExtensionChanger,
  },
  // 将来追加予定のアクションプレースホルダー
  {
    id: 'file-concatenator',
    name: 'ファイル統合出力（準備中）',
    description: '章フォルダ内のファイルをエピソードタイトル付きで1本のテキストに結合',
    icon: Layers,
    component: () => (
      <div className="batch-action-placeholder">
        <Layers size={24} className="batch-placeholder-icon" />
        <h4>ファイル統合出力（次回アップデートで追加予定）</h4>
        <p>
          選択したフォルダ内の複数エピソードを、タイトル見出し付きで1本のテキスト（.txt）や原稿ファイルに一括統合してエクスポートする機能です。
        </p>
      </div>
    ),
  },
];

export const BatchToolsPanel: React.FC = () => {
  const { projectPath } = useProject();
  const [activeActionId, setActiveActionId] = useState<string>('extension-changer');
  const [targetDir, setTargetDir] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<BatchFileItem[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const activeAction = AVAILABLE_ACTIONS.find((a) => a.id === activeActionId) || AVAILABLE_ACTIONS[0];
  const ActionComponent = activeAction.component;

  const handleExecutionComplete = useCallback(() => {
    // 実行完了時にファイルツリーを再スキャン
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  if (!projectPath) {
    return (
      <div className="batch-tools-panel empty">
        <div className="batch-empty-message">作品（プロジェクト）が開かれていません</div>
      </div>
    );
  }

  return (
    <div className="batch-tools-panel">
      {/* パネル上部: ツール選択タブ/ドロップダウン */}
      <div className="batch-header">
        <div className="batch-title-row">
          <Wrench size={16} className="batch-title-icon" />
          <span className="batch-panel-title">バッチ処理ツール</span>
        </div>

        <div className="batch-tool-tabs">
          {AVAILABLE_ACTIONS.map((action) => {
            const Icon = action.icon || Wrench;
            const isActive = action.id === activeActionId;
            return (
              <button
                key={action.id}
                className={`batch-tool-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveActionId(action.id)}
                title={action.description}
              >
                <Icon size={13} />
                <span>{action.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* パネル中央: 共通ファイルセレクター */}
      <div className="batch-selector-container">
        <BatchFileSelector
          projectPath={projectPath}
          targetDir={targetDir}
          onTargetDirChange={setTargetDir}
          onSelectedFilesChange={setSelectedFiles}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* パネル下部: 選択されたバッチアクション領域 */}
      <div className="batch-action-wrapper">
        <ActionComponent
          targetDir={targetDir || projectPath}
          selectedFiles={selectedFiles}
          onExecutionComplete={handleExecutionComplete}
        />
      </div>
    </div>
  );
};
