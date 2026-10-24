import React, { useState, useMemo } from 'react';
import { X, Search, Settings, Palette, FileText, BookOpen } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { settingsRegistry } from '../../core/settingsRegistry';
import './SettingsModal.css';

// アイコンマッピング
const iconMap: Record<string, React.ReactNode> = {
  Palette: <Palette size={16} />,
  FileText: <FileText size={16} />,
  BookOpen: <BookOpen size={16} />,
  Settings: <Settings size={16} />,
};

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, closeSettings, activeTabId, setActiveTabId, settings, updateSetting, resetSetting } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');

  // 登録済み全プラグインを取得
  const allTabs = useMemo(() => settingsRegistry.getAll(), []);

  // 検索クエリによるタブの絞り込み
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return allTabs;
    const q = searchQuery.toLowerCase();
    return allTabs.filter((tab) => {
      const matchTitle = tab.title.toLowerCase().includes(q);
      const matchKeywords = tab.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchTitle || matchKeywords;
    });
  }, [allTabs, searchQuery]);

  // 現在アクティブなタブ
  const activeTab = useMemo(() => {
    return allTabs.find((t) => t.id === activeTabId) || allTabs[0];
  }, [allTabs, activeTabId]);

  if (!isSettingsOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={closeSettings}>
      <div className="settings-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <Settings size={20} className="settings-modal-icon" />
            <span>環境設定</span>
          </div>
          <div className="settings-search-box">
            <Search size={14} className="settings-search-icon" />
            <input
              type="text"
              className="settings-search-input"
              placeholder="設定を検索 (例: フォント, テーマ, 行番号)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className="settings-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="settings-modal-close-btn"
            onClick={closeSettings}
            title="閉じる (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* ボディ（サイドバー + コンテンツ） */}
        <div className="settings-modal-body">
          {/* 左カテゴリサイドバー */}
          <div className="settings-sidebar">
            <div className="settings-nav-list">
              {filteredTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`settings-nav-item ${activeTab?.id === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span className="settings-nav-icon">
                    {tab.icon && iconMap[tab.icon] ? iconMap[tab.icon] : <Settings size={16} />}
                  </span>
                  <span className="settings-nav-title">{tab.title}</span>
                </button>
              ))}
              {filteredTabs.length === 0 && (
                <div className="settings-nav-empty">該当する設定はありません</div>
              )}
            </div>
          </div>

          {/* 右設定コンテンツ領域 */}
          <div className="settings-content-pane">
            {activeTab ? (
              <div className="settings-tab-panel">
                <div className="settings-tab-header">
                  <h3 className="settings-tab-title">{activeTab.title}</h3>
                </div>
                <div className="settings-tab-content">
                  {activeTab.render({
                    settings,
                    updateSetting,
                    resetSetting,
                    searchQuery,
                  })}
                </div>
              </div>
            ) : (
              <div className="settings-empty-pane">カテゴリを選択してください</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
