import React from "react";
import { panelRegistry } from "../../core/panelRegistry";
import { useTheme } from "../../contexts/ThemeContext";
import { useDocument } from "../../contexts/DocumentContext";
import { useSettings } from "restar-app-settings";
import { Sun, Moon, Coffee, Laptop, Settings } from "lucide-react";
import "./ActivityBar.css";

export type PanelId = string | null;

interface ActivityBarProps {
  side?: "left" | "right";
  activePanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
  onOpenSettings?: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  side = "left",
  activePanelId,
  onSelectPanel,
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { activeDocument } = useDocument();
  const { settings } = useSettings();

  // デバッグパネルの表示設定（デフォルト: true）
  const showDebugPanel = settings?.showDebugPanel !== false;

  // レジストリから該当サイドのパネル一覧を取得
  const panels = panelRegistry.getPanelsForSide(side).filter((p) => {
    if (p.id === 'novelaid.panel.debug' && !showDebugPanel) {
      return false;
    }

    // supportedDocumentTypes が指定されている場合、現在の activeDocument の形式と照合
    if (p.supportedDocumentTypes && p.supportedDocumentTypes.length > 0) {
      if (!activeDocument) {
        return false;
      }
      if (!p.supportedDocumentTypes.includes(activeDocument.documentType)) {
        return false;
      }
    }

    return true;
  });

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

  return (
    <aside className={`activity-bar side-${side}`} aria-label={`${side === "left" ? "左" : "右"}アクティビティバー`}>
      <div className="activity-bar-top">
        {panels.map((panel) => {
          const Icon = panel.icon;
          const isActive = activePanelId === panel.id;
          return (
            <button
              key={panel.id}
              type="button"
              className={`activity-button ${isActive ? "active" : ""}`}
              onClick={() => onSelectPanel(isActive ? null : panel.id)}
              title={panel.title}
              aria-label={panel.title}
            >
              <Icon size={22} />
            </button>
          );
        })}
      </div>

      {side === "left" && (
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
      )}
    </aside>
  );
};
