import React from 'react';
import type { SettingTabPlugin, SettingTabProps } from 'restar-app-settings';

const NovelPreviewSettingsTab: React.FC<SettingTabProps> = ({ settings, updateSetting }) => {
  return (
    <div className="settings-section">
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">デフォルト組版方向</label>
          <div className="setting-desc">プレビュー開始時の初期組版方向を指定します。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={settings.previewWritingMode || 'vertical-rl'}
            onChange={(e) => updateSetting('previewWritingMode', e.target.value)}
          >
            <option value="vertical-rl">縦書き (文庫本スタイル)</option>
            <option value="horizontal-tb">横書き (Web小説スタイル)</option>
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">プレビューフォントサイズ (px)</label>
          <div className="setting-desc">文庫本プレビューの文字サイズを指定します。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-number-input"
            min={12}
            max={32}
            value={settings.previewFontSize ?? 16}
            onChange={(e) => updateSetting('previewFontSize', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">文庫本フォント</label>
          <div className="setting-desc">縦書き組版で適用するフォントファミリーです。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={settings.previewFontFamily || '"Hiragino Mincho ProN", "Yu Mincho", serif'}
            onChange={(e) => updateSetting('previewFontFamily', e.target.value)}
          >
            <option value='"Hiragino Mincho ProN", "Yu Mincho", serif'>ヒラギノ明朝 / 游明朝 (標準)</option>
            <option value='"BIZ UDMincho", serif'>BIZ UD明朝 (ユニバーサルデザイン)</option>
            <option value='"Noto Serif JP", serif'>Noto Serif JP</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export const novelPreviewSettingsPlugin: SettingTabPlugin = {
  id: 'preview',
  title: '縦書きプレビュー',
  icon: 'BookOpen',
  order: 30,
  keywords: ['縦書き', 'プレビュー', '文庫', '組版', 'ルビ', '傍点', 'フォント'],
  defaultValues: {
    previewWritingMode: 'vertical-rl',
    previewFontSize: 16,
    previewFontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif',
  },
  render: (props) => <NovelPreviewSettingsTab {...props} />,
};
