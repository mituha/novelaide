import { useState, useRef, useEffect, useCallback } from "react";
import { X, FolderPlus, FilePlus } from "lucide-react";
import { PanelId } from "./ActivityBar";
import "./SidePane.css";

interface SidePaneProps {
  activePanel: PanelId;
  onClose: () => void;
}

export const SidePane: React.FC<SidePaneProps> = ({ activePanel, onClose }) => {
  const [width, setWidth] = useState(260);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(260);

  const startResize = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 180), 500);
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (!activePanel) return null;

  const renderHeader = () => {
    let title = "";
    switch (activePanel) {
      case "files":
        title = "ファイルエクスプローラー";
        break;
      case "search":
        title = "作品内検索";
        break;
      case "git":
        title = "執筆履歴 (Git)";
        break;
      case "metadata":
        title = "登場人物・設定資料";
        break;
    }

    return (
      <div className="side-pane-header">
        <span className="side-pane-title">{title}</span>
        <div className="side-pane-actions">
          {activePanel === "files" && (
            <>
              <button type="button" className="action-btn" title="新規ファイル作成" aria-label="新規ファイル作成">
                <FilePlus size={16} />
              </button>
              <button type="button" className="action-btn" title="新規フォルダ作成" aria-label="新規フォルダ作成">
                <FolderPlus size={16} />
              </button>
            </>
          )}
          <button type="button" className="action-btn close-btn" onClick={onClose} title="閉じる" aria-label="閉じる">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activePanel) {
      case "files":
        return (
          <div className="pane-placeholder">
            <p className="placeholder-text">フォルダが開かれていません</p>
            <button type="button" className="placeholder-btn">フォルダを開く</button>
          </div>
        );
      case "search":
        return (
          <div className="pane-placeholder">
            <input className="search-input" placeholder="原稿内を全文検索..." />
            <p className="placeholder-subtext">キーワードを入力してEnterを押してください</p>
          </div>
        );
      case "git":
        return (
          <div className="pane-placeholder">
            <p className="placeholder-text">執筆履歴の記録（Git）</p>
            <p className="placeholder-subtext">作品フォルダを開くと履歴タイムラインが表示されます</p>
          </div>
        );
      case "metadata":
        return (
          <div className="pane-placeholder">
            <p className="placeholder-text">キャラクター & 設定資料</p>
            <p className="placeholder-subtext">YAML Frontmatterから登場人物カードを自動生成します</p>
          </div>
        );
    }
  };

  return (
    <div className="side-pane-container" style={{ width: `${width}px` }}>
      {renderHeader()}
      <div className="side-pane-body">{renderContent()}</div>
      <div className="resize-handle" onMouseDown={startResize} />
    </div>
  );
};
