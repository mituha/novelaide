import { useState, useEffect } from "react";
import { ActivityBar, PanelId } from "./ActivityBar";
import { SidePane } from "./SidePane";
import { StatusBar } from "./StatusBar";
import { useProject } from "../../contexts/ProjectContext";
import { useDocument } from "../../contexts/DocumentContext";
import { useCharacterCount } from "../../hooks/useCharacterCount";
import { EditorTabs } from "../Editor/EditorTabs";
import { CodeEditor } from "../Editor/CodeEditor";
import { Feather, FolderOpen, PlusCircle } from "lucide-react";
import "./MainLayout.css";

interface MainLayoutProps {
  onOpenLauncher?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ onOpenLauncher }) => {
  const [activePanel, setActivePanel] = useState<PanelId>("files");
  const [selectedText, setSelectedText] = useState("");
  const { projectName, projectPath } = useProject();
  const { openDocuments, activePath, activeDocument, openDocument, updateContent } = useDocument();

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

  return (
    <div className="main-layout-root">
      <div className="main-layout-body">
        {/* 左端アクティビティバー */}
        <ActivityBar
          activePanel={activePanel}
          onSelectPanel={setActivePanel}
          onOpenSettings={() => alert("環境設定モーダル（Step 5で実装予定）")}
        />

        {/* 開閉式サイドペイン */}
        <SidePane
          activePanel={activePanel}
          onClose={() => setActivePanel(null)}
          onOpenLauncher={onOpenLauncher}
          onSelectFile={(file) => {
            if (!file.isDirectory) {
              openDocument(file.path);
            }
          }}
          selectedFilePath={activePath}
        />

        {/* メイン執筆領域 / ワークスペース */}
        <main className="main-content-area">
          {openDocuments.length > 0 && activeDocument ? (
            <div className="editor-workspace-view">
              <EditorTabs />
              <div className="editor-pane-body">
                <CodeEditor
                  path={activeDocument.path}
                  value={activeDocument.content}
                  language={activeDocument.documentType === "novel" ? "novel" : "markdown"}
                  onChange={(val) => updateContent(activeDocument.path, val || "")}
                />
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
                  <span>新規プロジェクトを作成</span>
                </button>
              </div>

              <p className="welcome-hint">
                左側のファイルエクスプローラーから原稿ファイルを選択すると、エディターが開きます。
              </p>
            </div>
          )}
        </main>
      </div>

      {/* 下部ステータスバー */}
      <StatusBar
        detailedMetrics={detailedMetrics}
        selectedMetrics={selectedMetrics}
        activePath={activePath}
        documentType={activeDocument?.documentType}
        onOpenLauncher={onOpenLauncher}
        onToggleSidePane={() => setActivePanel(activePanel ? null : "files")}
        isSidePaneVisible={activePanel !== null}
      />
    </div>
  );
};
