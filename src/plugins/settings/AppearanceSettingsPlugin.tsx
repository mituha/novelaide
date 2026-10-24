import React from 'react';
import type { SettingTabPlugin, SettingTabProps } from 'restar-app-settings';

const AppearanceSettingsTab: React.FC<SettingTabProps> = ({ settings, updateSetting }) => {
  const currentTheme = settings.theme || 'dark';

  return (
    <div className="settings-section">
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">カラーテーマ</label>
          <div className="setting-desc">エディター全体のカラーテーマを切り替えます。</div>
        </div>
        <div className="setting-control">
          <div className="theme-toggle-group">
            <button
              type="button"
              className={`theme-option-btn ${currentTheme === 'dark' ? 'active' : ''}`}
              onClick={() => updateSetting('theme', 'dark')}
            >
              🌙 ダーク
            </button>
            <button
              type="button"
              className={`theme-option-btn ${currentTheme === 'light' ? 'active' : ''}`}
              onClick={() => updateSetting('theme', 'light')}
            >
              ☀️ ライト
            </button>
            <button
              type="button"
              className={`theme-option-btn ${currentTheme === 'sepia' ? 'active' : ''}`}
              onClick={() => updateSetting('theme', 'sepia')}
            >
              📜 セピア（原稿用紙）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const appearanceSettingsPlugin: SettingTabPlugin = {
  id: 'appearance',
  title: '外観・テーマ',
  icon: 'Palette',
  order: 10,
  keywords: ['テーマ', 'カラー', 'ダーク', 'ライト', 'セピア', '色', 'デザイン'],
  defaultValues: {
    theme: 'dark',
  },
  render: (props) => <AppearanceSettingsTab {...props} />,
};
