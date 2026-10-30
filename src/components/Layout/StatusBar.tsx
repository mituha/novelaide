import React, { useState, useEffect, useRef } from "react";
import {
  Home,
  PanelLeft,
  PanelRight,
  Globe,
} from "lucide-react";
import { DetailedCountResult } from "novelaid-ruby";
import { NovelaidDocumentType } from "tauri-plugin-novelaid-fs-api";
import { DocumentIcon } from "../FileExplorer/DocumentIcon";
import { useTheme } from "../../contexts/ThemeContext";
import { useNotification } from "../../contexts/NotificationContext";
import "./StatusBar.css";

interface StatusBarProps {
  detailedMetrics?: DetailedCountResult | null;
  selectedMetrics?: DetailedCountResult | null;
  activePath?: string | null;
  documentType?: NovelaidDocumentType;
  onOpenLauncher?: () => void;
  onToggleSidePane?: () => void;
  isSidePaneVisible?: boolean;
  onToggleRightPane?: () => void;
  isRightPaneVisible?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  detailedMetrics,
  selectedMetrics,
  activePath,
  documentType = "novel",
  onOpenLauncher,
  onToggleSidePane,
  isSidePaneVisible = true,
  onToggleRightPane,
  isRightPaneVisible = false,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { statusMessage } = useNotification();
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // ポップアップの外側をクリックしたときに閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showPopup &&
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowPopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopup]);

  const fileName = activePath ? activePath.split(/[/\\]/).pop() : null;

  // セリフと地の文の比率計算
  const dialogueCharCount = detailedMetrics?.dialogue.charCount || 0;
  const narrativeCharCount = detailedMetrics?.narrative.charCount || 0;
  const totalStyleChar = dialogueCharCount + narrativeCharCount;
  const dialogueRatio = totalStyleChar > 0 ? (dialogueCharCount / totalStyleChar) * 100 : 0;
  const narrativeRatio = totalStyleChar > 0 ? (narrativeCharCount / totalStyleChar) * 100 : 0;

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
      {/* 左側グループ */}
      <div className="status-bar-left">
        <button
          type="button"
          className="status-action-btn"
          onClick={onOpenLauncher}
          title="作品一覧へ戻る"
        >
          <Home size={13} />
        </button>
        <button
          type="button"
          className={`status-action-btn ${!isSidePaneVisible ? "inactive" : ""}`}
          onClick={onToggleSidePane}
          title="サイドバーの表示切替"
        >
          <PanelLeft size={13} />
        </button>

        {statusMessage ? (
          <div className="status-message-flash" title={statusMessage}>
            <span className="status-message-dot" />
            <span className="status-message-text">{statusMessage}</span>
          </div>
        ) : activePath ? (
          <div className="status-file-info" title={activePath}>
            <DocumentIcon type={documentType} size={13} />
            <span className="status-file-name">{fileName}</span>
            <span className="status-doc-badge">
              {documentType.charAt(0).toUpperCase() + documentType.slice(1)}
            </span>
          </div>
        ) : (
          <span className="status-no-file">ファイル未選択</span>
        )}
      </div>

      {/* 右側グループ */}
      <div className="status-bar-right">
        {detailedMetrics && (
          <div
            className="status-char-count-trigger"
            ref={triggerRef}
            onClick={() => setShowPopup(!showPopup)}
            title="クリックして文字数詳細分析を表示"
          >
            {selectedMetrics ? (
              <span className="status-metric-highlight">
                選択中: {selectedMetrics.charCount.toLocaleString()} / {detailedMetrics.charCount.toLocaleString()} 字
              </span>
            ) : (
              <>
                <span className="status-metric-item">
                  文字数: {detailedMetrics.charCount.toLocaleString()}
                </span>
                <span className="status-metric-item">
                  行数: {detailedMetrics.lineCount.toLocaleString()}
                </span>
                <span className="status-metric-item">
                  ({detailedMetrics.manuscriptSheets.toFixed(1)} 枚)
                </span>
              </>
            )}
          </div>
        )}

        <div className="status-item" title="エンコーディング">
          <Globe size={12} />
          <span>UTF-8</span>
        </div>

        <div
          className="status-item clickable"
          onClick={toggleTheme}
          title="クリックでテーマを切り替え"
        >
          <span>{getThemeLabel()}</span>
        </div>

        {onToggleRightPane && (
          <button
            type="button"
            className={`status-btn ${isRightPaneVisible ? "active" : ""}`}
            onClick={onToggleRightPane}
            title={isRightPaneVisible ? "右サイドパネルを閉じる" : "右サイドパネルを開く"}
            aria-label="右サイドパネル切り替え"
          >
            <PanelRight size={13} />
          </button>
        )}
      </div>

      {/* 文字数詳細分析ポップアップ */}
      {showPopup && detailedMetrics && (
        <div className="char-count-popup" ref={popupRef}>
          <div className="char-popup-header">
            <span className="char-popup-title">文字数詳細分析</span>
            <button
              type="button"
              className="char-popup-close-btn"
              onClick={() => setShowPopup(false)}
            >
              &times;
            </button>
          </div>

          <div className="char-popup-body">
            {/* 基本カウント */}
            <div className="char-popup-section">
              <div className="char-section-title">基本カウント</div>
              <table className="char-popup-table">
                <tbody>
                  <tr>
                    <td className="char-col-label">基本文字数 (空白・改行除く)</td>
                    <td className="char-col-value">{detailedMetrics.charCount.toLocaleString()} 字</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">文字数 (空白・改行含む)</td>
                    <td className="char-col-value">{detailedMetrics.charCountWithSpaces.toLocaleString()} 字</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">総文字数 (RAW)</td>
                    <td className="char-col-value">{detailedMetrics.rawLength.toLocaleString()} 字</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">総行数</td>
                    <td className="char-col-value">{detailedMetrics.lineCount.toLocaleString()} 行</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">原稿用紙換算 (400字詰め)</td>
                    <td className="char-col-value highlight-sheets">
                      {detailedMetrics.manuscriptSheets.toFixed(1)} 枚
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 文体分析 */}
            <div className="char-popup-section">
              <div className="char-section-title">文体分析 (セリフ / 地の文)</div>
              <div className="char-ratio-bar">
                <div
                  className="char-ratio-dialogue"
                  style={{ width: `${dialogueRatio}%` }}
                  title={`セリフ: ${dialogueRatio.toFixed(1)}%`}
                />
                <div
                  className="char-ratio-narrative"
                  style={{ width: `${narrativeRatio}%` }}
                  title={`地の文: ${narrativeRatio.toFixed(1)}%`}
                />
              </div>
              <div className="char-ratio-labels">
                <span className="char-label-dialogue">
                  ● セリフ: {dialogueRatio.toFixed(1)}% ({dialogueCharCount.toLocaleString()}字 / {detailedMetrics.dialogue.lineCount}行)
                </span>
                <span className="char-label-narrative">
                  ● 地の文: {narrativeRatio.toFixed(1)}% ({narrativeCharCount.toLocaleString()}字 / {detailedMetrics.narrative.lineCount}行)
                </span>
              </div>
            </div>

            {/* 空白・改行の内訳 */}
            <div className="char-popup-section">
              <div className="char-section-title">空白・改行の内訳</div>
              <table className="char-popup-table">
                <tbody>
                  <tr>
                    <td className="char-col-label">全角スペース (字下げ等)</td>
                    <td className="char-col-value">{detailedMetrics.spaces.fullWidth.toLocaleString()} 個</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">半角スペース</td>
                    <td className="char-col-value">{detailedMetrics.spaces.halfWidth.toLocaleString()} 個</td>
                  </tr>
                  <tr>
                    <td className="char-col-label">改行数</td>
                    <td className="char-col-value">{detailedMetrics.newlines.toLocaleString()} 個</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
