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
} from 'lucide-react';
import { ChatMessage, AiModelInfo, AiPersonaType, AiPersona } from '../types';
import { fetchLmStudioModels, getFallbackModels } from '../client/modelManager';
import { streamChat } from '../client/chatSession';
import { useAIContextContent, ContextDocumentItem } from '../hooks/useAIContextContent';
import { AIChatInput } from './AIChatInput';
import { invoke } from '@tauri-apps/api/core';

export const DEFAULT_PERSONAS: AiPersona[] = [
  {
    id: 'partner',
    name: '執筆パートナー',
    role: '共創・アイデア出し',
    description: '物語の展開やキャラクター設定、描写の言い換えを一緒に考えます。',
    systemPrompt: 'あなたは小説作家の執筆パートナーです。作品の世界観を尊重し、魅力的なプロットや情景描写、キャラクター造形のアイデアを一緒に広げてください。',
  },
  {
    id: 'editor',
    name: '担当編集者',
    role: '講評・プロット構成',
    description: '読者視点で作品のテンポや伏線、ストーリー構成に率直な意見を出します。',
    systemPrompt: 'あなたは経験豊富な小説の担当編集者です。読者視点に立って、物語の導入、テンポ、伏線の張り方、キャラクターの魅力について建設的で率直なフィードバックを提供してください。',
  },
  {
    id: 'proofreader',
    name: '校正係',
    role: '文体・ルビ・誤字脱字',
    description: '助詞の重なり、文末の連続、ルビ書式、表記ゆれを厳格にチェックします。',
    systemPrompt: 'あなたは厳格な出版社の文芸校正係です。文章のリズム、助詞の重複、文末の単調な連続、ルビ記法、誤字脱字、表記ゆれを精緻にチェックし、改善案を提示してください。',
  },
  {
    id: 'character',
    name: '作中人物',
    role: 'キャラクター対話',
    description: '登場人物になりきって対話し、台詞の口調や感情の反応を検証します。',
    systemPrompt: 'あなたは小説の登場人物です。設定や口調に忠実になりきって、作家からの問いかけに対話し、セリフや行動の自然さを作家と一緒に検証してください。',
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
  }, [messages, isStreaming]);

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

  const handleClear = () => {
    setMessages([]);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userText = input;
    setInput('');

    // コンテキストの自動合成（novelaid-editor互換 [File: ...] 形式）
    const contextContent = await getContextText(
      activeLeftItem || null,
      activeRightItem || null,
      openDocuments,
      readFileDiskFn
    );

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      persona: currentPersona,
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setIsStreaming(true);

    try {
      const personaObj = DEFAULT_PERSONAS.find((p) => p.id === currentPersona) || DEFAULT_PERSONAS[0];
      const systemPrompt = personaObj.systemPrompt || '';

      // プロンプトメッセージ列の構築
      const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // 過去メッセージ履歴（最新数件）
      messages.slice(-6).forEach((m) => {
        if (m.id !== 'welcome') {
          apiMessages.push({
            role: m.role,
            content: m.content,
          });
        }
      });

      // 今回のコンテキスト付きユーザー発言
      let finalUserContent = userText;
      if (contextContent.trim()) {
        finalUserContent = `【参照原稿・設定資料コンテキスト】\n${contextContent}\n【作家からの質問・指示】\n${userText}`;
      }
      apiMessages.push({ role: 'user', content: finalUserContent });

      // ストリーミング対話の実行
      await streamChat(apiMessages, {
        model: selectedModel,
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg
            )
          );
        },
      });
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `エラーが発生しました: ${err.message || '通信失敗'}` }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // Rustネイティブツールのクイック実行
  const runProofread = async () => {
    const targetDoc = activeLeftItem || activeRightItem;
    if (!targetDoc) return;

    try {
      const res = await invoke<any>('plugin:novelaid-ai|ai_run_tool', {
        toolName: 'proofread_scan',
        targetFile: targetDoc.path,
        params: { content: targetDoc.content },
      });

      let summary = `【高速校正スキャン結果: ${targetDoc.baseName || '原稿'}】\n`;
      if (res.issues && res.issues.length > 0) {
        summary += `推敲ポイントが ${res.issues.length} 件見つかりました:\n`;
        res.issues.forEach((issue: any) => {
          summary += `・L${issue.line}: ${issue.message}\n`;
        });
      } else {
        summary += '・文末の連続: 正常（3文以上の重複なし）\n・ら抜き言葉・冗長表現: 検出されませんでした。\n良好なリズムで書かれています！';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `tool-${Date.now()}`,
          role: 'assistant',
          persona: 'proofreader',
          content: summary,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const runRubySuggest = async () => {
    const targetDoc = activeLeftItem || activeRightItem;
    if (!targetDoc) return;

    try {
      const res = await invoke<any>('plugin:novelaid-ai|ai_run_tool', {
        toolName: 'ruby_suggest',
        targetFile: targetDoc.path,
        params: { content: targetDoc.content },
      });

      let summary = `【ルビ候補抽出: ${targetDoc.baseName || '原稿'}】\n`;
      if (res.suggestions && res.suggestions.length > 0) {
        summary += `未ルビの固有名詞・難読語を検出しました（${res.suggestions.length}件）:\n`;
        res.suggestions.forEach((sug: any) => {
          summary += `・L${sug.line || '?'}: |${sug.word}《${sug.ruby}》\n`;
        });
      } else {
        summary += '現在本文に含まれる主要な固有名詞・難読語はすべてルビ設定済みです。';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `tool-${Date.now()}`,
          role: 'assistant',
          persona: 'proofreader',
          content: summary,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const searchMetadata = async () => {
    if (!getMetadataCacheFn) return;
    try {
      const cache = await getMetadataCacheFn();
      let summary = `【作品設定資料キャッシュ参照（Rust連携）】\n`;
      const entries = Object.entries(cache);
      if (entries.length > 0) {
        summary += `作品から ${entries.length} 件の設定資料を検出しました:\n`;
        entries.slice(0, 5).forEach(([filePath, meta]: [string, any]) => {
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const title = meta.title || meta.name || fileName;
          const role = meta.role ? ` (${meta.role})` : '';
          summary += `・${title}${role}: ${meta.summary || '設定メモあり'}\n`;
        });
      } else {
        summary += '設定資料が見つかりませんでした。';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `meta-${Date.now()}`,
          role: 'assistant',
          persona: 'partner',
          content: summary,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const getPersonaIcon = (id: AiPersonaType) => {
    switch (id) {
      case 'partner':
        return <Sparkles size={13} />;
      case 'editor':
        return <UserCheck size={13} />;
      case 'proofreader':
        return <CheckCheck size={13} />;
      case 'character':
        return <Bot size={13} />;
      default:
        return <Sparkles size={13} />;
    }
  };

  return (
    <div className="ai-chat-panel">
      {/* 上部ヘッダー：ペルソナ＆モデル */}
      <div className="ai-chat-header">
        <div className="ai-persona-selector">
          {DEFAULT_PERSONAS.map((p) => {
            const isActive = currentPersona === p.id;
            return (
              <button
                key={p.id}
                className={`ai-persona-chip ${isActive ? 'active' : ''}`}
                onClick={() => setCurrentPersona(p.id)}
                title={`${p.role}: ${p.description}`}
              >
                {getPersonaIcon(p.id)}
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        <div className="ai-meta-bar">
          <select
            className="ai-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <button className="ai-action-btn" onClick={handleClear} title="会話履歴をクリア">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* メッセージタイムライン */}
      <div className="ai-messages-container">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`ai-message ${isUser ? 'user' : 'assistant'}`}>
              <div className="ai-message-header">
                {!isUser && msg.persona && (
                  <>
                    {getPersonaIcon(msg.persona)}
                    <span>{DEFAULT_PERSONAS.find((p) => p.id === msg.persona)?.name || 'AI'}</span>
                  </>
                )}
                {isUser && <span>あなた</span>}
                <span>{msg.timestamp}</span>
              </div>
              <div className="ai-message-bubble">{msg.content}</div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="ai-streaming-indicator">
            <Sparkles size={12} className="spinning" />
            <span>AIが応答を生成中...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* クイックツールバー */}
      <div className="ai-quick-tools">
        <button
          className="ai-tool-btn"
          onClick={runRubySuggest}
          disabled={isStreaming}
          title="未ルビの固有名詞や難読漢字を抽出"
        >
          <BookmarkPlus size={13} />
          <span>ルビ抽出</span>
        </button>
        <button
          className="ai-tool-btn"
          onClick={runProofread}
          disabled={isStreaming}
          title="文末連続・ら抜き言葉スキャン"
        >
          <Search size={13} />
          <span>校正スキャン</span>
        </button>
        {getMetadataCacheFn && (
          <button
            className="ai-tool-btn"
            onClick={searchMetadata}
            disabled={isStreaming}
            title="作品設定資料キャッシュ参照"
          >
            <Database size={13} />
            <span>設定参照</span>
          </button>
        )}
      </div>

      {/* 入力欄 & コンテキストセレクター */}
      <AIChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        isStreaming={isStreaming}
        useTools={useTools}
        onUseToolsChange={setUseTools}
        useReasoning={useReasoning}
        onUseReasoningChange={setUseReasoning}
        activeLeftItem={activeLeftItem}
        activeRightItem={activeRightItem}
        openDocuments={openDocuments}
      />
    </div>
  );
};
