import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  UserCheck,
  CheckCheck,
  Trash2,
  BookmarkPlus,
  Search,
  Database,
  Wrench,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { ChatMessage, AiModelInfo, AiPersonaType, AiPersona } from '../types';
import { fetchLmStudioModels, getFallbackModels } from '../client/modelManager';
import { PiWritingAgentSession, ToolExecutor, UIDocumentContext } from '../client/chatSession';
import { getPersonaGuideline } from '../domain/guidelines';
import { useAIContextContent, ContextDocumentItem } from '../hooks/useAIContextContent';
import { AIChatInput } from './AIChatInput';
import { invoke } from '@tauri-apps/api/core';

export const DEFAULT_PERSONAS: AiPersona[] = [
  {
    id: 'partner',
    name: '執筆パートナー',
    role: '共創・アイデア出し',
    description: '物語の展開やキャラクター設定、描写の言い換えを一緒に考えます。',
    systemPrompt: `あなたは小説作家の執筆パートナーです。作品の世界観を尊重し、魅力的なプロットや情景描写、キャラクター造形のアイデアを一緒に広げてください。\n\n${getPersonaGuideline('novel')}`,
  },
  {
    id: 'editor',
    name: '担当編集者',
    role: '講評・プロット構成',
    description: '読者視点で作品のテンポや伏線、ストーリー構成に率直な意見を出します。',
    systemPrompt: `あなたは経験豊富な小説の担当編集者です。読者視点に立って、物語の導入、テンポ、伏線の張り方、キャラクターの魅力について建設的で率直なフィードバックを提供してください。\n\n${getPersonaGuideline('plot')}`,
  },
  {
    id: 'proofreader',
    name: '校正係',
    role: '文体・ルビ・誤字脱字',
    description: '助詞の重なり、文末の連続、ルビ書式、表記ゆれを厳格にチェックします。',
    systemPrompt: `あなたは厳格な出版社の文芸校正係です。文章のリズム、助詞の重複、文末の単調な連続、ルビ記法、誤字脱字、表記ゆれを精緻にチェックし、改善案を提示してください。\n\n${getPersonaGuideline('novel')}`,
  },
  {
    id: 'character',
    name: '作中人物',
    role: 'キャラクター対話',
    description: '登場人物になりきって対話し、台詞の口調や感情の反応を検証します。',
    systemPrompt: `あなたは小説の登場人物です。設定や口調に忠実になりきって、作家からの問いかけに対話し、セリフや行動の自然さを作家と一緒に検証してください。\n\n${getPersonaGuideline('chat')}`,
  },
];

export interface AIChatPanelProps {
  activeLeftItem?: ContextDocumentItem | null;
  activeRightItem?: ContextDocumentItem | null;
  openDocuments?: ContextDocumentItem[];
  readFileDiskFn?: (path: string) => Promise<string>;
  getMetadataCacheFn?: () => Promise<Record<string, any>>;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  activeLeftItem,
  activeRightItem,
  openDocuments = [],
  readFileDiskFn,
  getMetadataCacheFn,
}) => {
  const { getContextText } = useAIContextContent();
  const [models, setModels] = useState<AiModelInfo[]>(getFallbackModels());
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [currentPersona, setCurrentPersona] = useState<AiPersonaType>('partner');
  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [useTools, setUseTools] = useState<boolean>(true);
  const [useReasoning, setUseReasoning] = useState<boolean>(false);
  const [activeToolStatus, setActiveToolStatus] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [lastDebugLog, setLastDebugLog] = useState<string>('');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      persona: 'partner',
      content: 'こんにちは！執筆のお手伝いをします。\nプロットの相談、表現のアイデア出し、校正やルビ振りなど何でもお気軽にお声がけください。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, activeToolStatus]);

  // モデル一覧の初期読み込み
  useEffect(() => {
    async function loadModels() {
      const list = await fetchLmStudioModels();
      setModels(list);
      if (list.length > 0) {
        setSelectedModel(list[0].id);
      }
    }
    loadModels();
  }, []);

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        persona: currentPersona,
        content: '履歴をクリアしました。新しい対話を始めましょう。',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // メッセージのクリップボードコピー
  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch (err) {
      console.error('[AIChatPanel] メッセージコピー失敗:', err);
    }
  };

  // 調査用デバッグログのコンソール出力およびクリップボードコピー
  const handleExportDebugLog = async () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      currentPersona,
      selectedModel,
      availableModels: models.map((m) => m.id),
      useTools,
      useReasoning,
      activeLeftItem: activeLeftItem?.path || null,
      activeRightItem: activeRightItem?.path || null,
      openDocumentsCount: openDocuments.length,
      messageCount: messages.length,
      lastMessages: messages.slice(-3).map((m) => ({
        role: m.role,
        persona: m.persona,
        contentPreview: m.content.slice(0, 100),
      })),
      lastError: lastDebugLog || null,
    };

    const formattedLog = `=== Novelaid AI Debug Log ===\n${JSON.stringify(debugInfo, null, 2)}`;
    console.log('[Novelaid AI Debug Info]', debugInfo);

    try {
      await navigator.clipboard.writeText(formattedLog);
      alert('調査用デバッグ情報をコンソールに出力し、クリップボードにコピーしました。');
    } catch {
      alert('調査用デバッグ情報をコンソール（F12）に出力しました。');
    }
  };

  // UI ドキュメントコンテキスト（未保存バッファおよび開いているタブ一覧へのリアルタイムアクセス）
  const uiDocumentContext: UIDocumentContext = {
    getOpenDocuments: () =>
      openDocuments.map((doc) => ({
        path: doc.path,
        title: doc.name || doc.path.split(/[/\\]/).pop() || '無題',
        isDirty: doc.isDirty ?? false,
      })),
    getActiveDocument: (side?: 'left' | 'right') => {
      const doc = side === 'right' ? activeRightItem : (activeLeftItem || activeRightItem);
      if (!doc) return null;
      return {
        path: doc.path,
        title: doc.name || doc.path.split(/[/\\]/).pop() || '無題',
        content: doc.content || '',
        isDirty: doc.isDirty ?? false,
      };
    },
  };

  // pi-coding-agent 互換ツールエグゼキューター（Rustネイティブツール ＆ インメモリフォールバック）
  const toolExecutor: ToolExecutor = async (toolName: string, args: Record<string, any>) => {
    // 1. UI・未保存バッファ直接連携ツール（フロントエンド完結）
    if (toolName === 'get_open_documents') {
      const docs = uiDocumentContext.getOpenDocuments();
      return { status: 'success', documents: docs, count: docs.length };
    }

    if (toolName === 'get_active_document') {
      const doc = uiDocumentContext.getActiveDocument(args.side);
      if (doc) return { status: 'success', document: doc };
      return { status: 'not_found', message: 'アクティブなドキュメントが見つかりませんでした。' };
    }

    // 2. 解析ツール（未保存最新バッファを補填してバックエンドRustへ委譲）
    const activeDoc = activeLeftItem || activeRightItem;
    const content = args.text || args.content || activeDoc?.content || '';

    if (toolName === 'scan_proofread' || toolName === 'proofread_scan') {
      return await invoke<any>('plugin:novelaid-ai|ai_run_tool', {
        toolName: 'proofread_scan',
        targetFile: args.fileName || activeDoc?.path || '',
        params: { content },
      });
    }

    if (toolName === 'extract_ruby' || toolName === 'ruby_suggest') {
      return await invoke<any>('plugin:novelaid-ai|ai_run_tool', {
        toolName: 'ruby_suggest',
        targetFile: activeDoc?.path || '',
        params: { content },
      });
    }

    if (toolName === 'search_metadata') {
      const query = (args.query || '').toLowerCase();
      if (getMetadataCacheFn) {
        try {
          const cache = await getMetadataCacheFn();
          const results: any[] = [];
          for (const [key, val] of Object.entries(cache)) {
            const strVal = JSON.stringify(val).toLowerCase();
            if (key.toLowerCase().includes(query) || strVal.includes(query)) {
              results.push({ key, title: (val as any).title || key, snippet: strVal.slice(0, 150) });
            }
          }
          return { query, results: results.slice(0, 5) };
        } catch {
          // フォールバック
        }
      }
      return await invoke<any>('plugin:novelaid-ai|ai_run_tool', {
        toolName: 'search_metadata',
        targetFile: '',
        params: { query: args.query },
      });
    }

    return { error: `未対応のツールです: ${toolName}` };
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userText = input.trim();
    setInput('');

    // 現在のコンテキスト文字列を合成
    const contextContent = await getContextText(
      activeLeftItem || null,
      activeRightItem || null,
      openDocuments,
      readFileDiskFn
    );

    const userMsgId = `user-${Date.now()}`;
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ユーザー発言を履歴に追加
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: userText,
        timestamp: userTimestamp,
      },
    ]);

    setIsStreaming(true);
    setActiveToolStatus(null);
    const assistantMsgId = `asst-${Date.now()}`;

    // アシスタント初期枠を作成
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        persona: currentPersona,
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    try {
      // Pi Coding Agent SDK 標準準拠の PiWritingAgentSession でプロンプト実行
      const session = new PiWritingAgentSession({
        model: selectedModel,
        persona: currentPersona,
        contextContent,
        uiDocumentContext,
        toolExecutor: useTools ? toolExecutor : undefined,
        onToken: (delta) => {
          console.log('[AIChatPanel] トークン描画更新:', delta);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg
            )
          );
        },
        onEvent: (event) => {
          console.log('[AIChatPanel] エージェントイベント受信:', event.type, event);
          if (event.type === 'tool_call_start') {
            const toolLabel =
              event.toolName === 'get_open_documents'
                ? '開いている文書一覧取得'
                : event.toolName === 'get_active_document'
                ? '未保存原稿バッファ取得'
                : event.toolName === 'scan_proofread' || event.toolName === 'proofread_scan'
                ? '校正解析エンジン'
                : event.toolName === 'extract_ruby' || event.toolName === 'ruby_suggest'
                ? 'ルビ候補抽出'
                : event.toolName === 'search_metadata'
                ? '設定資料検索'
                : event.toolName;
            setActiveToolStatus(`ツール実行中: ${toolLabel}...`);
          } else if (event.type === 'tool_call_end') {
            setActiveToolStatus(null);
          }
        },
      });

      await session.prompt(userText, contextContent);
    } catch (err: any) {
      const errDetails = `${err.message || '通信失敗'}\nStack: ${err.stack || 'No stack trace'}`;
      console.error('[AIChatPanel] チャット送信エラー詳細:', err, err.stack);
      setLastDebugLog(errDetails);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `エラーが発生しました: ${err.message || '通信失敗'}` }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      setActiveToolStatus(null);
    }
  };

  // クイックツールバーからの手動実行（Extension のスラッシュコマンド経由で一元実行）
  const runProofread = async () => {
    try {
      const contextContent = await getContextText(
        activeLeftItem || null,
        activeRightItem || null,
        openDocuments,
        readFileDiskFn
      );
      const session = new PiWritingAgentSession({
        model: selectedModel,
        persona: currentPersona,
        contextContent,
        uiDocumentContext,
        toolExecutor: useTools ? toolExecutor : undefined,
      });
      const res = await session.executeCommand('/proofread');
      if (res.output) {
        setMessages((prev) => [
          ...prev,
          {
            id: `cmd-${Date.now()}`,
            role: 'assistant',
            persona: 'proofreader',
            content: res.output!,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const runRubySuggest = async () => {
    try {
      const contextContent = await getContextText(
        activeLeftItem || null,
        activeRightItem || null,
        openDocuments,
        readFileDiskFn
      );
      const session = new PiWritingAgentSession({
        model: selectedModel,
        persona: currentPersona,
        contextContent,
        uiDocumentContext,
        toolExecutor: useTools ? toolExecutor : undefined,
      });
      const res = await session.executeCommand('/ruby');
      if (res.output) {
        setMessages((prev) => [
          ...prev,
          {
            id: `cmd-${Date.now()}`,
            role: 'assistant',
            persona: 'proofreader',
            content: res.output!,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const searchProjectMetadata = async () => {
    if (!getMetadataCacheFn) return;
    try {
      const cache = await getMetadataCacheFn();
      const keys = Object.keys(cache);
      let summary = `【プロジェクト設定資料一覧（${keys.length}件）】\n`;
      keys.forEach((k) => {
        const item = cache[k];
        summary += `・${item.title || k} (${item.type || 'meta'}): ${item.summary || item.role || ''}\n`;
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `tool-${Date.now()}`,
          role: 'assistant',
          persona: 'editor',
          content: summary,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const getPersonaIcon = (type: AiPersonaType) => {
    switch (type) {
      case 'partner':
        return <Sparkles size={13} />;
      case 'editor':
        return <UserCheck size={13} />;
      case 'proofreader':
        return <CheckCheck size={13} />;
      case 'character':
        return <Bot size={13} />;
    }
  };

  return (
    <div className="ai-chat-panel">
      {/* ヘッダー: ペルソナ切替 & モデル選択 */}
      <div className="ai-chat-header">
        <div className="ai-persona-selector">
          {DEFAULT_PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`ai-persona-chip ${currentPersona === p.id ? 'active' : ''}`}
              onClick={() => setCurrentPersona(p.id)}
              title={p.description}
            >
              {getPersonaIcon(p.id)}
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        <div className="ai-meta-bar">
          <select
            className="ai-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            title="利用するLLMモデル"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="ai-header-actions">
            <button
              className="ai-action-btn"
              onClick={handleExportDebugLog}
              title="調査用デバッグログをコピー・出力"
            >
              <Terminal size={13} />
            </button>

            <button
              className="ai-action-btn"
              onClick={handleClearHistory}
              title="対話履歴をクリア"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* メッセージ履歴 */}
      <div className="ai-messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message ${msg.role}`}>
            <div className="ai-message-header">
              <div className="ai-message-sender">
                {msg.role === 'assistant' && msg.persona && (
                  <>
                    {getPersonaIcon(msg.persona)}
                    <span>{DEFAULT_PERSONAS.find((p) => p.id === msg.persona)?.name}</span>
                  </>
                )}
                {msg.role === 'user' && <span>作家</span>}
                <span className="timestamp">{msg.timestamp}</span>
              </div>
              <button
                className="ai-copy-btn"
                onClick={() => handleCopyMessage(msg.id, msg.content)}
                title={copiedMsgId === msg.id ? 'コピーしました！' : '内容をコピー'}
              >
                {copiedMsgId === msg.id ? (
                  <Check size={11} className="copied" />
                ) : (
                  <Copy size={11} />
                )}
              </button>
            </div>
            <div className="ai-message-bubble">{msg.content}</div>
          </div>
        ))}

        {/* ツール実行中インジケーター */}
        {activeToolStatus && (
          <div className="ai-tool-running-indicator">
            <Wrench size={12} className="spin" />
            <span>{activeToolStatus}</span>
          </div>
        )}

        {isStreaming && !activeToolStatus && (
          <div className="ai-streaming-indicator">
            <Bot size={13} className="spin" />
            <span>AIが思考・執筆中...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* クイックツールバー */}
      <div className="ai-quick-tools">
        <button
          className="ai-tool-btn"
          onClick={runRubySuggest}
          disabled={!activeLeftItem && !activeRightItem}
          title="本文内の未ルビ漢字・固有名詞を自動抽出"
        >
          <BookmarkPlus size={12} />
          <span>ルビ抽出</span>
        </button>
        <button
          className="ai-tool-btn"
          onClick={runProofread}
          disabled={!activeLeftItem && !activeRightItem}
          title="文末連続・ら抜き言葉・冗長表現を高速スキャン"
        >
          <Search size={12} />
          <span>校正スキャン</span>
        </button>
        <button
          className="ai-tool-btn"
          onClick={searchProjectMetadata}
          disabled={!getMetadataCacheFn}
          title="キャラクターや世界観設定を一覧参照"
        >
          <Database size={12} />
          <span>設定参照</span>
        </button>
      </div>

      {/* コンテキストセレクター & 自動リサイズ入力欄 */}
      <AIChatInput
        value={input}
        onChange={setInput}
        onSend={handleSendMessage}
        isStreaming={isStreaming}
        placeholder="メッセージを入力、または /help, /ruby, /proofread (Enterで送信)..."
        useTools={useTools}
        onUseToolsChange={setUseTools}
        useReasoning={useReasoning}
        onUseReasoningChange={setUseReasoning}
        activeLeftItem={activeLeftItem || null}
        activeRightItem={activeRightItem || null}
        openDocuments={openDocuments}
      />
    </div>
  );
};
