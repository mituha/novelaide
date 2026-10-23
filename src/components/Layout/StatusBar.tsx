import { GitBranch, FileText, Globe } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useProject } from "../../contexts/ProjectContext";
import "./StatusBar.css";

interface StatusBarProps {
  charCount?: number;
  manuscriptPages?: number;
  branchName?: string;
  onOpenLauncher?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  charCount = 0,
  manuscriptPages = 0.0,
  branchName = "main",
  onOpenLauncher,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { projectName } = useProject();

  const getThemeLabel = () => {
    switch (theme) {
      case "light":
        return "テーマ: ライト";
      case "dark":
        return "テーマ: ダーク";
      case "sepia":
        return "テーマ: セピア";
      case "system":
        return "テーマ: システム";
    }
  };

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <div className="status-item" title="Gitブランチ">
          <GitBranch size={13} />
          <span>{branchName}</span>
        </div>
        <div
          className="status-item clickable"
          onClick={onOpenLauncher}
          title="クリックでプロジェクト選択画面を開く"
        >
          <FileText size={13} />
          <span>作品: {projectName || "未選択（クリックで開く）"}</span>
        </div>
      </div>

      <div className="status-bar-right">
        <div className="status-item" title="原稿用紙換算枚数 (400字詰)">
          <span>{charCount} 文字 ({manuscriptPages.toFixed(1)} 枚)</span>
        </div>
        <div className="status-item" title="ファイルエンコーディング">
          <Globe size={13} />
          <span>UTF-8</span>
        </div>
        <div className="status-item clickable" onClick={toggleTheme} title="クリックでテーマ切り替え">
          <span>{getThemeLabel()}</span>
        </div>
      </div>
    </footer>
  );
};
