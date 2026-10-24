import React, { useState, useEffect, useRef, useCallback } from "react";
import { ActivityBar } from "./ActivityBar";
import { SidePane } from "./SidePane";
import { StatusBar } from "./StatusBar";
import { useProject } from "../../contexts/ProjectContext";
import { useDocument } from "../../contexts/DocumentContext";
import { useCharacterCount } from "../../hooks/useCharacterCount";
import { EditorTabs } from "../Editor/EditorTabs";
import { DocumentPane } from "../DocumentPane/DocumentPane";
import { Feather, FolderOpen, PlusCircle } from "lucide-react";
import "./MainLayout.css";

interface MainLayoutProps {
  onOpenLauncher?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ onOpenLauncher }) => {
  // 左ペイン・右ペインのアクティブパネルID
  const [leftActivePanelId, setLeftActivePanelId] = useState<string | null>(
    "novelaid.panel.files"
  );
  const [rightActivePanelId, setRightActivePanelId] = useState<string | null>(null);

  const [selectedText, setSelectedText] = useState("");
  const [splitRatio, setSplitRatio] = useState<number>(0.5); // 左右分割比率 (0.2 ~ 0.8)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { projectName, projectPath } = useProject();
  const {
    openDocuments,
    activeDocument,
    isSplitActive,
    updateContent,
  } = useDocument();

  // 選択テキスト変更イベントの受信
  useEffect(() => {
    const handleSelectionChange = (e: any) => {
      setSelectedText(e.detail?.text || "");
    };

    window.addEventListener("editor-selection-change", handleSelectionChange);
    return () => {
      window.removeEventListener("editor-selection-change", handleSelectionChange);
    };
  }, []);

  // リアルタイム文字数・原稿用紙換算カウント
  const { detailedMetrics, selectedMetrics } = useCharacterCount(
    activeDocument?.content || "",
    selectedText,
    150
  );

  // スプリッターのドラッグ開始
  const handleMouseDownSplitter = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // スプリッターのドラッグ中および終了処理
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      // 20% 〜 80% の範囲に制限
      setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="main-layout-root">
      <div className="main-layout-body">
        {/* 左端アクティビティバー */}
        <ActivityBar
          side="left"
          activePanelId={leftActivePanelId}
          onSelectPanel={setLeftActivePanelId}
          onOpenSettings={() => alert("環境設定モーダル（Step 5で実装予定）")}
        />

        {/* 左サイドペイン (プロジェクト全体) */}
        <SidePane
          paneSide="left"
          activePanelId={leftActivePanelId}
          onClose={() => setLeftActivePanelId(null)}
          onOpenLauncher={onOpenLauncher}
        />

        {/* メイン執筆領域 / ワークスペース */}
        <main className="main-content-area">
          {openDocuments.length > 0 && activeDocument ? (
            <div className="editor-workspace-view">
              <EditorTabs />
              <div className="editor-pane-body" ref={containerRef}>
                {isSplitActive ? (
                  /* 左右スプリット表示 */
                  <div className="editor-split-container">
                    {/* 左ペイン */}
                    <div
                      className="editor-split-pane pane-left"
                      style={{ width: `${splitRatio * 100}%` }}
                    >
                      <DocumentPane
                        document={activeDocument}
                        viewMode={activeDocument.leftViewMode}
                        paneSide="left"
                        onChangeContent={(val) =>
                          updateContent(activeDocument.path, val)
                        }
                      />
                    </div>

                    {/* スプリッター (リサイズハンドル) */}
                    <div
                      className={`editor-splitter ${isDragging ? "dragging" : ""}`}
                      onMouseDown={handleMouseDownSplitter}
                      title="ドラッグして画面分割比率を調整"
                    />

                    {/* 右ペイン */}
                    <div
                      className="editor-split-pane pane-right"
                      style={{ width: `${(1 - splitRatio) * 100}%` }}
                    >
                      <DocumentPane
                        document={activeDocument}
                        viewMode={activeDocument.rightViewMode}
                        paneSide="right"
                        onChangeContent={(val) =>
                          updateContent(activeDocument.path, val)
                        }
                      />
                    </div>
                  </div>
                ) : (
                  /* 単一ペイン表示 (左ペインのみ) */
                  <DocumentPane
                    document={activeDocument}
                    viewMode={activeDocument.leftViewMode}
                    paneSide="left"
                    onChangeContent={(val) =>
                      updateContent(activeDocument.path, val)
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="welcome-container">
              <div className="welcome-header">
                <Feather className="welcome-icon" size={44} />
                <h1 className="welcome-title">novelaide</h1>
                <p className="welcome-subtitle">
                  {projectName
                    ? `作品「${projectName}」を開いています (${projectPath})`
                    : "小説執筆用デスクトップエディター"}
                </p>
              </div>

              <div className="quick-actions">
                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={onOpenLauncher}
                >
                  <FolderOpen size={18} />
                  <span>作品フォルダを開く</span>
                </button>
                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={onOpenLauncher}
                >
                  <PlusCircle size={18} />
                  <span>新規作品を作成</span>
                </button>
              </div>

              <div className="welcome-hint">
                <p>左側のエクスプローラーからファイルを選択して執筆を開始してください。</p>
              </div>
            </div>
          )}
        </main>

        {/* 右サイドペイン (ドキュメント個別) */}
        <SidePane
          paneSide="right"
          activePanelId={rightActivePanelId}
          onClose={() => setRightActivePanelId(null)}
          onOpenLauncher={onOpenLauncher}
        />

        {/* 右端アクティビティバー */}
        <ActivityBar
          side="right"
          activePanelId={rightActivePanelId}
          onSelectPanel={setRightActivePanelId}
        />
      </div>

      {/* 最下部ステータスバー */}
      <StatusBar
        detailedMetrics={detailedMetrics}
        selectedMetrics={selectedMetrics}
        activePath={activeDocument?.path}
        documentType={activeDocument?.documentType}
        onToggleSidePane={() =>
          setLeftActivePanelId((prev) =>
            prev ? null : "novelaid.panel.files"
          )
        }
        isSidePaneVisible={!!leftActivePanelId}
        onToggleRightPane={() =>
          setRightActivePanelId((prev) =>
            prev ? null : "novelaid.panel.outline"
          )
        }
        isRightPaneVisible={!!rightActivePanelId}
      />
    </div>
  );
};
