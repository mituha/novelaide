import React, { useState, useEffect, useCallback } from 'react';
import type { SettingTabPlugin, SettingTabProps } from 'restar-app-settings';
import {
  fetchAllAvailableModels,
  getEnvApiKey,
  AiModelInfo,
  DEFAULT_LM_STUDIO_URL,
} from 'tauri-plugin-novelaid-ai-api';
import {
  updateMcpConfig,
  getMcpStatus,
  McpStatus,
  McpPermissionLevel,
} from 'tauri-plugin-novelaid-mcp-api';
import { externalControlService, McpLogItem } from '../../services/externalControlService';
import { RefreshCw, Eye, EyeOff, CheckCircle2, Server, ShieldCheck, ShieldAlert, Activity, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

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

  const mcpEnabled = !!settings.mcpEnabled;
  const mcpPort = typeof settings.mcpPort === 'number' ? settings.mcpPort : 3000;
  const mcpPermission: McpPermissionLevel = settings.mcpPermission === 'write' ? 'write' : 'read';

  const [availableModels, setAvailableModels] = useState<AiModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [detectedEnvKey, setDetectedEnvKey] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [mcpLogs, setMcpLogs] = useState<McpLogItem[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // MCP 通信ログのリアルタイム購読
  useEffect(() => {
    const unsub = externalControlService.subscribeLogs((logs) => {
      setMcpLogs(logs);
    });
    return unsub;
  }, []);

  // MCP サーバー状態の取得と同期
  const refreshMcpStatus = useCallback(async () => {
    try {
      const status = await getMcpStatus();
      setMcpStatus(status);
    } catch (e) {
      console.warn('Failed to get MCP status:', e);
    }
  }, []);

  useEffect(() => {
    refreshMcpStatus();
  }, [refreshMcpStatus]);

  // MCP設定変更時のバックエンド同期
  const handleUpdateMcpConfig = async (nextEnabled: boolean, nextPort: number, nextPerm: McpPermissionLevel) => {
    updateSetting('mcpEnabled', nextEnabled);
    updateSetting('mcpPort', nextPort);
    updateSetting('mcpPermission', nextPerm);

    try {
      const updated = await updateMcpConfig({
        enabled: nextEnabled,
        port: nextPort,
        permission: nextPerm,
      });
      setMcpStatus(updated);
    } catch (e: any) {
      setStatusMessage(`MCP設定更新エラー: ${e?.message || e}`);
    }
  };

  // OS 環境変数からのキー検出
  useEffect(() => {
    getEnvApiKey('gemini').then((key) => {
      setDetectedEnvKey(!!key);
    });
  }, []);

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
            Gemini 2.5 Flash / Pro などのクラウドモデルを利用するための API キーです（OS環境変数 GEMINI_API_KEY が設定されている場合は自動認識されます）。
          </div>
        </div>
        <div className="setting-control" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              className="setting-text-input"
              style={{ width: '100%', paddingRight: '32px' }}
              placeholder={detectedEnvKey ? 'OS環境変数 GEMINI_API_KEY を検出済' : 'AIzaSy...'}
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
          {!geminiApiKey && detectedEnvKey && (
            <div style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} />
              <span>OS環境変数（GEMINI_API_KEY）を認識中（入力不要で利用可能）</span>
            </div>
          )}
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

      <div style={{ margin: '24px 0 16px', borderTop: '1px solid var(--border-color, #e0e0e0)' }} />

      {/* MCP / 外部制御サーバー設定 */}
      <div className="setting-header-title" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Server size={18} />
        外部制御 / MCP サーバー連携
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
        外部の AI エージェント（Claude Desktop, Cursor, Goose, Cline 等）から Model Context Protocol (MCP) を経由して、エディターのファイル閲覧・編集・校正・ルビ抽出を安全に実行できる連携機能です。
      </div>

      {/* MCP 有効/無効トグル */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">MCP サーバーを有効にする</label>
          <div className="setting-desc">
            有効にするとバックエンドで SSE トランスポートサーバーが起動し、外部ツールからの接続を受け付けます。
          </div>
        </div>
        <div className="setting-control">
          <label className="setting-switch" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
            <input
              type="checkbox"
              checked={mcpEnabled}
              onChange={(e) => handleUpdateMcpConfig(e.target.checked, mcpPort, mcpPermission)}
            />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>
              {mcpEnabled ? (mcpStatus?.isRunning ? '稼働中 (Active)' : '起動待機中') : '無効 (Disabled)'}
            </span>
          </label>
        </div>
      </div>

      {/* 権限設定（書き込み制限） */}
      <div className="setting-row">
        <div className="setting-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label className="setting-label">外部アクセス権限（書き込み制限）</label>
            {mcpPermission === 'read' ? (
              <ShieldCheck size={16} style={{ color: '#10b981' }} />
            ) : (
              <ShieldAlert size={16} style={{ color: '#f59e0b' }} />
            )}
          </div>
          <div className="setting-desc">
            外部 AI からの操作権限を制限します。「読み込み専用」の場合、ファイルの参照や校正・ルビ・メタデータ検索のみを許可し、新規作成や直接編集・置換は安全に拒否されます。
          </div>
        </div>
        <div className="setting-control">
          <select
            className="setting-select"
            value={mcpPermission}
            onChange={(e) => handleUpdateMcpConfig(mcpEnabled, mcpPort, e.target.value as McpPermissionLevel)}
          >
            <option value="read">読み込み専用 (read - 推奨・安全)</option>
            <option value="write">読み書き可能 (write - ファイル直接編集を許可)</option>
          </select>
        </div>
      </div>

      {/* ポート番号 */}
      <div className="setting-row">
        <div className="setting-info">
          <label className="setting-label">サーバーポート番号</label>
          <div className="setting-desc">MCP SSE 接続を受け付けるローカルポート番号です（デフォルト: 3000）。</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            className="setting-text-input"
            style={{ width: '120px' }}
            value={mcpPort}
            onChange={(e) => {
              const p = parseInt(e.target.value, 10);
              if (!isNaN(p) && p > 0 && p <= 65535) {
                handleUpdateMcpConfig(mcpEnabled, p, mcpPermission);
              }
            }}
          />
        </div>
      </div>

      {/* 接続情報サマリー */}
      {mcpEnabled && mcpStatus?.isRunning && (
        <div
          style={{
            marginTop: '8px',
            padding: '10px 14px',
            backgroundColor: 'var(--bg-secondary, #f8f9fa)',
            borderRadius: '6px',
            border: '1px solid var(--border-color, #e0e0e0)',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            🟢 MCP サーバー接続 URL:
          </div>
          <code style={{ fontSize: '12px', color: '#2563eb', fontFamily: 'monospace' }}>
            http://127.0.0.1:{mcpStatus.port}/sse
          </code>
          <div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>
            外部ツール設定例: <code>{`{ "url": "http://127.0.0.1:${mcpStatus.port}/sse" }`}</code>
          </div>
        </div>
      )}

      {/* リアルタイム通信ログ */}
      <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color, #e0e0e0)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={16} style={{ color: '#8b5cf6' }} />
            リアルタイム通信ログ（最新 {mcpLogs.length} 件）
          </div>
          {mcpLogs.length > 0 && (
            <button
              type="button"
              className="setting-button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '3px 8px',
                background: 'transparent',
                border: '1px solid var(--border-color, #e0e0e0)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onClick={() => externalControlService.clearLogs()}
            >
              <Trash2 size={12} />
              ログ消去
            </button>
          )}
        </div>

        {mcpLogs.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-secondary, #f9fafb)',
              borderRadius: '6px',
              border: '1px dashed var(--border-color, #e0e0e0)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.6,
            }}
          >
            現在、外部からの通信ログはありません。<br />
            外部 AI（LM Studio, Claude Desktop, Cursor 等）からツールを実行すると、ここに通信ログがリアルタイム表示されます。
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '260px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {mcpLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasError = log.isError;
              return (
                <div
                  key={log.id}
                  style={{
                    backgroundColor: 'var(--bg-secondary, #f8f9fa)',
                    border: `1px solid ${hasError ? '#fca5a5' : 'var(--border-color, #e0e0e0)'}`,
                    borderRadius: '6px',
                    fontSize: '12px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        [{log.timestamp}]
                      </span>
                      <span
                        style={{
                          backgroundColor: '#ede9fe',
                          color: '#6d28d9',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          fontSize: '11px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {log.toolName}
                      </span>
                      <span
                        style={{
                          color: hasError ? '#dc2626' : '#16a34a',
                          fontWeight: 600,
                          fontSize: '11px',
                        }}
                      >
                        {hasError ? 'ERROR' : 'OK'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                        ({log.durationMs}ms)
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderTop: '1px solid var(--border-color, #e0e0e0)',
                        backgroundColor: 'var(--bg-primary, #ffffff)',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          ▶ 受信引数 (Arguments):
                        </div>
                        <pre style={{ margin: 0, padding: '4px 8px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '4px', overflowX: 'auto' }}>
                          {JSON.stringify(log.arguments, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          ▶ 返却結果 (Result):
                        </div>
                        <pre style={{ margin: 0, padding: '4px 8px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '4px', overflowX: 'auto', maxHeight: '140px' }}>
                          {JSON.stringify(log.result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const aiSettingsPlugin: SettingTabPlugin = {
  id: 'ai',
  title: 'AI執筆アシスタント',
  icon: 'Bot',
  order: 40,
  keywords: ['AI', 'Gemini', 'LM Studio', 'モデル', 'LLM', '校正', 'パートナー', 'APIキー', 'MCP', '外部制御', 'Claude'],
  defaultValues: {
    aiLmStudioUrl: DEFAULT_LM_STUDIO_URL,
    aiGeminiApiKey: '',
    aiScopedModels: DEFAULT_AI_SCOPED_MODELS,
    aiDefaultModel: 'gemini:gemini-2.5-flash',
    mcpEnabled: false,
    mcpPort: 3000,
    mcpPermission: 'read',
  },
  render: (props) => <AiSettingsTab {...props} />,
};
