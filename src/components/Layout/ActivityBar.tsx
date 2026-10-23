import {
  Files,
  Search,
  GitBranch,
  BookOpen,
  Sun,
  Moon,
  Coffee,
  Laptop,
  Settings,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import "./ActivityBar.css";

export type PanelId = "files" | "search" | "git" | "metadata" | null;

interface ActivityBarProps {
  activePanel: PanelId;
  onSelectPanel: (panel: PanelId) => void;
  onOpenSettings?: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activePanel,
  onSelectPanel,
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun size={20} />;
      case "dark":
        return <Moon size={20} />;
      case "sepia":
        return <Coffee size={20} />;
      case "system":
        return <Laptop size={20} />;
    }
  };

  const getThemeTitle = () => {
    switch (theme) {
      case "light":
        return "テーマ: ライト（クリックでセピアへ）";
      case "dark":
        return "テーマ: ダーク（クリックでライトへ）";
      case "sepia":
        return "テーマ: セピア（クリックでシステム追従へ）";
      case "system":
        return "テーマ: システム追従（クリックでダークへ）";
    }
  };

  const navItems = [
    { id: "files" as const, title: "ファイル一覧 (Ctrl+Shift+E)", icon: <Files size={22} /> },
    { id: "search" as const, title: "検索 (Ctrl+Shift+F)", icon: <Search size={22} /> },
    { id: "git" as const, title: "執筆履歴 (Git)", icon: <GitBranch size={22} /> },
    { id: "metadata" as const, title: "登場人物・設定資料", icon: <BookOpen size={22} /> },
  ];

  return (
    <aside className="activity-bar">
      <div className="activity-bar-top">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`activity-button ${activePanel === item.id ? "active" : ""}`}
            onClick={() => onSelectPanel(activePanel === item.id ? null : item.id)}
            title={item.title}
            aria-label={item.title}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="activity-bar-bottom">
        <button
          type="button"
          className="activity-button"
          onClick={toggleTheme}
          title={getThemeTitle()}
          aria-label="テーマ切り替え"
        >
          {getThemeIcon()}
        </button>

        <button
          type="button"
          className="activity-button"
          onClick={onOpenSettings}
          title="環境設定"
          aria-label="環境設定"
        >
          <Settings size={20} />
        </button>
      </div>
    </aside>
  );
};
