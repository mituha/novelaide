import { useState } from "react";
import { ActivityBar, PanelId } from "./ActivityBar";
import { SidePane } from "./SidePane";
import { StatusBar } from "./StatusBar";
import { useProject } from "../../contexts/ProjectContext";
import { invoke } from "@tauri-apps/api/core";
import { Feather, FolderOpen, PlusCircle } from "lucide-react";
import "./MainLayout.css";

interface MainLayoutProps {
  onOpenLauncher?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ onOpenLauncher }) => {
  const [activePanel, setActivePanel] = useState<PanelId>("files");
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const { projectName, projectPath } = useProject();

  const handleGreet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await invoke<string>("greet", {
        name: name.trim() || "執筆者",
      });
      setGreetMsg(response);
    } catch (err) {
      console.error("Greet command failed:", err);
    }
  };

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
        />

        {/* メイン執筆領域 / ワークスペース */}
        <main className="main-content-area">
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

            {/* バックエンド疎通テストカード */}
            <div className="test-card">
              <h3>Rustバックエンド疎通確認</h3>
              <p className="test-description">
                Tauri IPC経由でRustネイティブコマンド（<code>greet</code>）を呼び出します。
              </p>
              <form className="test-form" onSubmit={handleGreet}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="お名前または執筆ネーム..."
                  className="test-input"
                />
                <button type="submit" className="test-btn">
                  送信
                </button>
              </form>
              {greetMsg && <p className="greet-result">{greetMsg}</p>}
            </div>
          </div>
        </main>
      </div>

      {/* 最下部ステータスバー */}
      <StatusBar onOpenLauncher={onOpenLauncher} />
    </div>
  );
};
