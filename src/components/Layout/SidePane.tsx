import React, { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { panelRegistry } from "../../core/panelRegistry";
import { useDocument } from "../../contexts/DocumentContext";
import "./SidePane.css";

interface SidePaneProps {
  paneSide: "left" | "right";
  activePanelId: string | null;
  onClose: () => void;
  onOpenLauncher?: () => void;
}

export const SidePane: React.FC<SidePaneProps> = ({
  paneSide,
  activePanelId,
  onClose,
  onOpenLauncher,
}) => {
  const [width, setWidth] = useState(260);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(260);
  const { activeDocument } = useDocument();

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      isResizing.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // 左ペインなら右ドラッグで広がり、右ペインなら左ドラッグで広がる
      const delta = paneSide === "left"
        ? e.clientX - startX.current
        : startX.current - e.clientX;
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
  }, [paneSide]);

  if (!activePanelId) return null;

  const panel = panelRegistry.findPanel(activePanelId);
  if (!panel) return null;

  const PanelComponent = panel.component;

  return (
    <aside
      className={`side-pane-container pane-${paneSide}`}
      style={{ width: `${width}px` }}
      aria-label={`${paneSide === "left" ? "左" : "右"}サイドパネル`}
    >
      <div className="side-pane-header">
        <span className="side-pane-title">{panel.title}</span>
        <div className="side-pane-actions">
          <button
            type="button"
            className="action-btn close-btn"
            onClick={onClose}
            title="サイドパネルを閉じる"
            aria-label="サイドパネルを閉じる"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="side-pane-body">
        <PanelComponent
          paneSide={paneSide}
          activeDocument={activeDocument}
          onClose={onClose}
          onOpenLauncher={onOpenLauncher}
        />
      </div>

      {/* リサイズハンドル */}
      <div
        className={`resize-handle handle-${paneSide} ${isResizing.current ? "active" : ""}`}
        onMouseDown={startResize}
        title="ドラッグしてパネル幅を調整"
      />
    </aside>
  );
};
