import React from 'react';
import type { SettingTabPlugin, SettingTabProps } from '../../types/settingsPlugin';

const EditorSettingsTab: React.FC<SettingTabProps> = ({ settings, updateSetting }) => {
  return (
    <div className="settings-section">
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">フォントファミリー</label>
          <div className="setting-desc">エディター内で使用するフォントを指定します。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={settings.editorFontFamily || 'YuMincho, "Yu Mincho", "Hiragino Mincho ProN", serif'}
            onChange={(e) => updateSetting('editorFontFamily', e.target.value)}
          >
            <option value='YuMincho, "Yu Mincho", "Hiragino Mincho ProN", serif'>游明朝体 (標準明朝)</option>
            <option value='"BIZ UDMincho", "Noto Serif JP", serif'>BIZ UD明朝 (UDフォント)</option>
            <option value='"Yu Gothic", "Hiragino Sans", sans-serif'>游ゴシック体 (ゴシック)</option>
            <option value='Consolas, "Courier New", monospace'>Consolas (等幅)</option>
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">フォントサイズ (px)</label>
          <div className="setting-desc">エディターの文字サイズを設定します。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-number-input"
            min={10}
            max={36}
            value={settings.editorFontSize ?? 16}
            onChange={(e) => updateSetting('editorFontSize', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">行の高さ (倍率)</label>
          <div className="setting-desc">文字サイズに対する行送りの倍率です（1.5〜2.2推奨）。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-number-input"
            step="0.1"
            min={1.2}
            max={3.0}
            value={settings.editorLineHeight ?? 1.8}
            onChange={(e) => updateSetting('editorLineHeight', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">行番号の表示</label>
          <div className="setting-desc">エディター左端の行番号表示を切り替えます。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={settings.editorLineNumbers || 'on'}
            onChange={(e) => updateSetting('editorLineNumbers', e.target.value)}
          >
            <option value="on">表示 (on)</option>
            <option value="off">非表示 (off)</option>
            <option value="relative">相対行 (relative)</option>
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">折り返し (Word Wrap)</label>
          <div className="setting-desc">エディター右端での自動改行・折り返しを切り替えます。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={settings.editorWordWrap || 'on'}
            onChange={(e) => updateSetting('editorWordWrap', e.target.value)}
          >
            <option value="on">有効 (on)</option>
            <option value="off">無効 (off)</option>
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">ミニマップ表示</label>
          <div className="setting-desc">エディター右側のコードミニマップの表示を切り替えます。</div>
        </div>
        <div className="setting-control">
          <label className="setting-checkbox-label">
            <input
              type="checkbox"
              checked={settings.editorMinimap ?? false}
              onChange={(e) => updateSetting('editorMinimap', e.target.checked)}
            />
            <span>ミニマップを表示する</span>
          </label>
        </div>
      </div>

      <div className="setting-divider" />

      <h4 className="setting-subheading">原稿用紙換算設定</h4>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">1行あたりの文字数</label>
          <div className="setting-desc">ステータスバーの原稿用紙換算枚数の計算に使用します。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-number-input"
            min={10}
            max={100}
            value={settings.manuscriptCharsPerLine ?? 20}
            onChange={(e) => updateSetting('manuscriptCharsPerLine', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">1ページあたりの行数</label>
          <div className="setting-desc">1行×行数で1枚あたりの文字数を算出します（標準400字: 20字×20行）。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-number-input"
            min={10}
            max={100}
            value={settings.manuscriptLinesPerPage ?? 20}
            onChange={(e) => updateSetting('manuscriptLinesPerPage', Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
};

export const editorSettingsPlugin: SettingTabPlugin = {
  id: 'editor',
  title: 'エディター',
  icon: 'FileText',
  order: 20,
  keywords: ['フォント', '文字サイズ', '行番号', '折り返し', 'ミニマップ', '原稿用紙', '換算', '行間'],
  defaultValues: {
    editorFontFamily: 'YuMincho, "Yu Mincho", "Hiragino Mincho ProN", serif',
    editorFontSize: 16,
    editorLineHeight: 1.8,
    editorLineNumbers: 'on',
    editorWordWrap: 'on',
    editorMinimap: false,
    manuscriptCharsPerLine: 20,
    manuscriptLinesPerPage: 20,
    autoSaveInterval: 30,
  },
  render: (props) => <EditorSettingsTab {...props} />,
};
