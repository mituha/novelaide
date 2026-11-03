import React, { useState, useEffect, useCallback } from 'react';
import type { SettingTabPlugin, SettingTabProps } from 'restar-app-settings';
import {
  fetchAllAvailableModels,
  AiModelInfo,
  DEFAULT_LM_STUDIO_URL,
} from 'tauri-plugin-novelaid-ai-api';
import { RefreshCw, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export const DEFAULT_AI_SCOPED_MODELS = [
  'gemini:gemini-2.5-flash',
  'gemini:gemini-2.5-pro',
  'lm-studio:qwen2.5-7b-instruct',
];

const AiSettingsTab: React.FC<SettingTabProps> = ({ settings, updateSetting }) => {
  const lmStudioUrl = settings.aiLmStudioUrl || DEFAULT_LM_STUDIO_URL;
  const geminiApiKey = settings.aiGeminiApiKey || '';
  const scopedModels: string[] = Array.isArray(settings.aiScopedModels)
    ? settings.aiScopedModels
    : DEFAULT_AI_SCOPED_MODELS;
  const defaultModel = settings.aiDefaultModel || 'gemini:gemini-2.5-flash';

  const [availableModels, setAvailableModels] = useState<AiModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 最新モデル一覧の動的フェッチ
  const refreshModels = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const models = await fetchAllAvailableModels({
        lmStudioUrl,
        geminiApiKey,
        providers: ['gemini', 'lm-studio'],
      });
      setAvailableModels(models);
      setStatusMessage(`最新モデル一覧を取得しました（${models.length} 件）`);
    } catch (e: any) {
      setStatusMessage(`モデル取得エラー: ${e?.message || e}`);
    } finally {
      setIsLoading(false);
    }
  }, [lmStudioUrl, geminiApiKey]);

  // 設定タブ表示時に自動で最新情報を取得
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const handleToggleScopedModel = (modelKey: string) => {
    const next = scopedModels.includes(modelKey)
      ? scopedModels.filter((id) => id !== modelKey)
      : [...scopedModels, modelKey];
    updateSetting('aiScopedModels', next);

    // デフォルトモデルが解除された場合、先頭の有効モデルにフォールバック
    if (!next.includes(defaultModel) && next.length > 0) {
      updateSetting('aiDefaultModel', next[0]);
    }
  };

  const geminiModels = availableModels.filter((m) => m.provider === 'gemini');
  const lmStudioModels = availableModels.filter((m) => m.provider === 'lm-studio');

  return (
    <div className="settings-section">
      <div className="setting-header-title" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
        AI プロバイダー接続設定
      </div>

      {/* Google Gemini API キー */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">Google Gemini API キー</label>
          <div className="setting-desc">
            Gemini 2.5 Flash / Pro などのクラウドモデルを利用するための API キーです（Google AI Studio で取得可能）。
          </div>
        </div>
        <div className="setting-control" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              className="setting-text-input"
              style={{ width: '100%', paddingRight: '32px' }}
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => updateSetting('aiGeminiApiKey', e.target.value.trim())}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary, #888)',
              }}
              title={showApiKey ? '非表示' : '表示'}
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* LM Studio 接続URL */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">LM Studio 接続 URL</label>
          <div className="setting-desc">
            ローカルLLMサーバー（LM Studio）のエンドポイントです（デフォルト: http://localhost:1234/v1）。
          </div>
        </div>
        <div className="setting-control">
          <input
            type="text"
            className="setting-text-input"
            style={{ width: '260px' }}
            value={lmStudioUrl}
            onChange={(e) => updateSetting('aiLmStudioUrl', e.target.value.trim())}
          />
        </div>
      </div>

      <div style={{ margin: '16px 0 8px', borderTop: '1px solid var(--border-color, #e0e0e0)' }} />

      {/* モデル動的取得ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            利用可能モデル（Scoped Models）
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>
            チャット画面で素早く切り替えて使いたいモデルにチェックを入れてください。
          </div>
        </div>
        <button
          type="button"
          onClick={refreshModels}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid var(--border-color, #ccc)',
            background: 'var(--bg-secondary, #f5f5f5)',
            cursor: isLoading ? 'wait' : 'pointer',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}
        >
          <RefreshCw size={13} className={isLoading ? 'spin-icon' : ''} />
          <span>{isLoading ? '取得中...' : '最新情報に更新'}</span>
        </button>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '6px 10px',
            marginBottom: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            backgroundColor: 'var(--bg-secondary, #f0f0f0)',
            color: 'var(--text-secondary, #555)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={13} color="#10b981" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Google Gemini モデル一覧 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Google Gemini モデル
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
          {geminiModels.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>モデルが見つかりません</div>
          ) : (
            geminiModels.map((m) => {
              const modelKey = `gemini:${m.id}`;
              const isChecked = scopedModels.includes(modelKey);
              return (
                <label
                  key={modelKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleScopedModel(modelKey)}
                  />
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    ({(m.contextWindow || 0).toLocaleString()} tokens)
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* LM Studio モデル一覧 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          LM Studio モデル（ローカル）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
          {lmStudioModels.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              LM Studio に接続されていないか、ロード中のモデルがありません
            </div>
          ) : (
            lmStudioModels.map((m) => {
              const modelKey = `lm-studio:${m.id}`;
              const isChecked = scopedModels.includes(modelKey);
              return (
                <label
                  key={modelKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleScopedModel(modelKey)}
                  />
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div style={{ margin: '16px 0 8px', borderTop: '1px solid var(--border-color, #e0e0e0)' }} />

      {/* 新規チャット時のデフォルトモデル */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">新規チャットのデフォルトモデル</label>
          <div className="setting-desc">新しいチャットやAIパネルを開いた際に初期選択されるモデルです。</div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={defaultModel}
            onChange={(e) => updateSetting('aiDefaultModel', e.target.value)}
          >
            {scopedModels.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export const aiSettingsPlugin: SettingTabPlugin = {
  id: 'ai',
  title: 'AI執筆アシスタント',
  icon: 'Bot',
  order: 40,
  keywords: ['AI', 'Gemini', 'LM Studio', 'モデル', 'LLM', '校正', 'パートナー', 'APIキー'],
  defaultValues: {
    aiLmStudioUrl: DEFAULT_LM_STUDIO_URL,
    aiGeminiApiKey: '',
    aiScopedModels: DEFAULT_AI_SCOPED_MODELS,
    aiDefaultModel: 'gemini:gemini-2.5-flash',
  },
  render: (props) => <AiSettingsTab {...props} />,
};
