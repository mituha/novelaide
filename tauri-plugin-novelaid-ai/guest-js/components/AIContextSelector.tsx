import React, { useState } from 'react';
import { FileText, X, ChevronDown, ChevronRight, Plus, Box } from 'lucide-react';
import { useAIContext } from '../contexts/AIContextContext';
import { ContextDocumentItem } from '../hooks/useAIContextContent';

interface AIContextSelectorProps {
  activeLeftItem?: ContextDocumentItem | null;
  activeRightItem?: ContextDocumentItem | null;
  openDocuments?: ContextDocumentItem[];
}

export const AIContextSelector: React.FC<AIContextSelectorProps> = ({
  activeLeftItem,
  activeRightItem,
  openDocuments = [],
}) => {
  const { contextState, setContextState, addCustomPath, removeCustomPath } = useAIContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const getFileName = (path: string | null) => {
    if (!path) return '';
    const doc = openDocuments.find((d) => d.path === path);
    if (doc?.baseName) return doc.baseName;
    return path.split(/[/\\]/).pop() || path;
  };

  const handleToggleIncludeLeft = () => {
    setContextState((prev) => ({ ...prev, includeLeftActive: !prev.includeLeftActive }));
  };

  const handleToggleIncludeRight = () => {
    setContextState((prev) => ({ ...prev, includeRightActive: !prev.includeRightActive }));
  };

  const handleToggleIncludeAll = () => {
    setContextState((prev) => ({ ...prev, includeAllOpen: !prev.includeAllOpen }));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const path = e.dataTransfer.getData('text/plain');
    if (path) {
      addCustomPath(path);
      setIsExpanded(true);
    }
  };

  const leftActivePath = activeLeftItem?.path || null;
  const rightActivePath = activeRightItem?.path || null;

  const activeCount =
    (contextState.includeLeftActive && activeLeftItem ? 1 : 0) +
    (contextState.includeRightActive && activeRightItem ? 1 : 0) +
    (contextState.includeAllOpen
      ? Math.max(
          0,
          openDocuments.length -
            (activeLeftItem ? 1 : 0) -
            (rightActivePath && rightActivePath !== leftActivePath ? 1 : 0)
        )
      : 0) +
    contextState.customPaths.length;

  return (
    <div className="ai-context-selector">
      <div className="ai-context-summary" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Box size={14} className="icon-context" />
        <span className="summary-text">AI コンテキスト</span>
        <div className="badge">{activeCount}</div>
      </div>

      {isExpanded && (
        <div className="ai-context-details">
          <div className="context-section">
            {leftActivePath && (
              <label className="context-item">
                <input
                  type="checkbox"
                  checked={contextState.includeLeftActive}
                  onChange={handleToggleIncludeLeft}
                />
                <span className="side-label">左:</span>
                <span className="file-name" title={leftActivePath}>
                  {getFileName(leftActivePath)}
                </span>
              </label>
            )}
            {rightActivePath && rightActivePath !== leftActivePath && (
              <label className="context-item">
                <input
                  type="checkbox"
                  checked={contextState.includeRightActive}
                  onChange={handleToggleIncludeRight}
                />
                <span className="side-label">右:</span>
                <span className="file-name" title={rightActivePath}>
                  {getFileName(rightActivePath)}
                </span>
              </label>
            )}
            <label className="context-item all-open">
              <input
                type="checkbox"
                checked={contextState.includeAllOpen}
                onChange={handleToggleIncludeAll}
              />
              <span className="all-label">その他の開いているタブも含める</span>
            </label>
          </div>

          <div
            className={`context-custom-dropzone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="dropzone-header">
              <Plus size={12} />
              <span>任意ファイルを追加 (ここに D&D)</span>
            </div>

            {contextState.customPaths.length > 0 && (
              <div className="custom-file-list">
                {contextState.customPaths.map((path) => (
                  <div key={path} className="custom-file-item">
                    <FileText size={12} />
                    <span className="file-name" title={path}>
                      {path.split(/[/\\]/).pop()}
                    </span>
                    <button
                      className="remove-btn"
                      onClick={() => removeCustomPath(path)}
                      title="除外"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
