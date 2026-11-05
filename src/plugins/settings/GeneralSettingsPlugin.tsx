import React, { useState } from 'react';
import type { SettingTabPlugin, SettingTabProps } from 'restar-app-settings';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { UpdateModal } from '../../components/Update/UpdateModal';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import packageJson from '../../../package.json';

const GeneralSettingsTab: React.FC<SettingTabProps> = ({ settings, updateSetting }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'upToDate' | 'error'>('idle');
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const autoCheck = settings.autoCheckUpdateOnStartup !== false;

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    setCheckStatus('idle');
    setErrorMessage(null);

    try {
      const update = await updateService.checkForUpdate(false);
      if (update) {
        setFoundUpdate(update);
        setIsModalOpen(true);
      } else {
        setCheckStatus('upToDate');
      }
    } catch (err: any) {
      console.error('[GeneralSettingsTab] Check update failed:', err);
      setCheckStatus('error');
      setErrorMessage(err?.message || '更新の確認中にエラーが発生しました。ネットワーク接続を確認してください。');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="settings-section">
      {/* アプリケーション情報 */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">アプリケーション情報</label>
          <div className="setting-desc">現在の novelaide のバージョンおよびシステム構成です。</div>
        </div>
        <div className="setting-control" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #ffffff)' }}>
            novelaide <span style={{ color: 'var(--accent-color, #007acc)', fontSize: '13px' }}>v{packageJson.version}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #888888)' }}>
            Tauri v2 / React 19 / TypeScript
          </div>
        </div>
      </div>

      {/* 自動更新チェック設定 */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">起動時の自動更新確認</label>
          <div className="setting-desc">
            アプリ起動時にバックグラウンドで最新バージョンを確認し、新しい更新がある場合のみ通知します。
          </div>
        </div>
        <div className="setting-control">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={(e) => updateSetting('autoCheckUpdateOnStartup', e.target.checked)}
            />
            <span style={{ fontSize: '13px' }}>起動時に自動で更新を確認する</span>
          </label>
        </div>
      </div>

      {/* 手動アップデート確認 */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">アップデートの確認</label>
          <div className="setting-desc">
            GitHub Releases から novelaide の最新バージョンが公開されているか今すぐ確認します。
          </div>
        </div>
        <div className="setting-control" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="theme-option-btn"
            style={{
              padding: '6px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isChecking ? 'not-allowed' : 'pointer',
              opacity: isChecking ? 0.7 : 1,
            }}
            onClick={handleCheckUpdate}
            disabled={isChecking}
          >
            <RefreshCw size={14} className={isChecking ? 'spin-icon' : ''} />
            {isChecking ? '確認中...' : '更新を確認'}
          </button>
        </div>
      </div>

      {/* 確認結果メッセージ */}
      {checkStatus === 'upToDate' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '6px', fontSize: '13px', color: '#4caf50' }}>
          <CheckCircle size={16} />
          <span>現在ご利用のバージョン (v{packageJson.version}) は最新です。</span>
        </div>
      )}

      {checkStatus === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)', borderRadius: '6px', fontSize: '13px', color: '#f44336' }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* アップデートモーダル */}
      {foundUpdate && (
        <UpdateModal
          updateInfo={foundUpdate}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};

export const generalSettingsPlugin: SettingTabPlugin = {
  id: 'general',
  title: '全般・更新',
  icon: 'Settings',
  order: 1,
  keywords: ['全般', '更新', 'アップデート', 'バージョン', '最新', '情報'],
  defaultValues: {
    autoCheckUpdateOnStartup: true,
  },
  render: (props) => <GeneralSettingsTab {...props} />,
};
