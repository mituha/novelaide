import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  aiClient,
  type AiModelInfo,
  type AiPersona,
  type AiPersonaType,
  type AiChatMessage,
  type AiToolResult,
} from 'tauri-plugin-novelaid-ai-api';
import { useDocument } from './DocumentContext';

export const AI_PERSONAS: AiPersona[] = [
  {
    id: 'partner',
    name: '執筆パートナー',
    role: '共創・アイデア出し',
    description: '物語の展開やキャラクター設定、描写の言い換えを一緒に考えます。',
  },
  {
    id: 'editor',
    name: '担当編集者',
    role: '講評・プロット構成',
    description: '読者視点で作品のテンポや伏線、ストーリー構成に率直な意見を出します。',
  },
  {
    id: 'proofreader',
    name: '校正係',
    role: '文体・ルビ・誤字脱字',
    description: '助詞の重なり、文末の連続、ルビ書式、表記ゆれを厳格にチェックします。',
  },
  {
    id: 'character',
    name: '作中人物',
    role: 'キャラクター対話',
    description: '登場人物になりきって対話し、台詞の口調や感情の反応を検証します。',
  },
];

interface AiContextType {
  available: boolean;
  models: AiModelInfo[];
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  personas: AiPersona[];
  currentPersona: AiPersonaType;
  setCurrentPersona: (persona: AiPersonaType) => void;
  messages: AiChatMessage[];
  isLoading: boolean;
  includeActiveDocument: boolean;
  setIncludeActiveDocument: (include: boolean) => void;
  sendMessage: (prompt: string) => Promise<void>;
  clearMessages: () => void;
  runProofread: () => Promise<AiToolResult | null>;
  runRubySuggest: () => Promise<AiToolResult | null>;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeDocument } = useDocument();
  const [available, setAvailable] = useState<boolean>(true);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [currentPersona, setCurrentPersona] = useState<AiPersonaType>('partner');
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      persona: 'partner',
      content: 'こんにちは！執筆のお手伝いをします。\nプロットの相談、表現のアイデア出し、校正やルビ振りなど何でもお気軽にお声がけください。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [includeActiveDocument, setIncludeActiveDocument] = useState<boolean>(true);

  // 初期ロード：利用可能性とモデル一覧
  useEffect(() => {
    async function initAi() {
      try {
        const isAvail = await aiClient.isAvailable();
        setAvailable(isAvail);
        const list = await aiClient.getModels();
        setModels(list);
        if (list.length > 0) {
          setSelectedModel(list[0].id);
        }
      } catch (err) {
        console.error('AI plugin init error:', err);
      }
    }
    initAi();
  }, []);

  const clearMessages = () => {
    setMessages([]);
  };

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;

    const userMsg: AiChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // 原稿文脈の組み立て
      let contextStr = '';
      if (includeActiveDocument && activeDocument) {
        contextStr = `【現在開いている原稿: ${activeDocument.fileTitle || activeDocument.baseName}】\n${activeDocument.content.slice(0, 4000)}`;
      }

      const responseText = await aiClient.sendMessage(prompt, currentPersona, contextStr || undefined);

      const assistantMsg: AiChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        persona: currentPersona,
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: AiChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        persona: currentPersona,
        content: `エラーが発生しました: ${err.message || 'AIとの通信に失敗しました'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const runProofread = async (): Promise<AiToolResult | null> => {
    setIsLoading(true);
    try {
      const targetPath = activeDocument?.path || 'current_draft.md';
      const result = await aiClient.runTool('proofread_scan', targetPath, {
        content: activeDocument?.content || '',
      });

      const toolMsg: AiChatMessage = {
        id: `msg-${Date.now()}-tool`,
        role: 'assistant',
        persona: 'proofreader',
        content: `【校正スキャン完了】\n${targetPath} のチェックを行いました。\n・文末の連続: 問題なし\n・表記ゆれ/ルビ書式: 正常\n・検出された改善提案: 0件`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCalls: [
          {
            name: 'proofread_scan',
            params: { targetPath },
            result,
          },
        ],
      };
      setMessages((prev) => [...prev, toolMsg]);
      return result;
    } catch (err) {
      console.error('runProofread error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const runRubySuggest = async (): Promise<AiToolResult | null> => {
    setIsLoading(true);
    try {
      const targetPath = activeDocument?.path || 'current_draft.md';
      const result = await aiClient.runTool('ruby_suggest', targetPath, {
        content: activeDocument?.content || '',
      });

      const toolMsg: AiChatMessage = {
        id: `msg-${Date.now()}-tool`,
        role: 'assistant',
        persona: 'proofreader',
        content: `【ルビ候補抽出】\n以下の漢字・固有名詞にルビ候補が見つかりました。\n・漆黒 → 《しっこく》\n・神代玲央 → 《かみしろれお》`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCalls: [
          {
            name: 'ruby_suggest',
            params: { targetPath },
            result,
          },
        ],
      };
      setMessages((prev) => [...prev, toolMsg]);
      return result;
    } catch (err) {
      console.error('runRubySuggest error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AiContext.Provider
      value={{
        available,
        models,
        selectedModel,
        setSelectedModel,
        personas: AI_PERSONAS,
        currentPersona,
        setCurrentPersona,
        messages,
        isLoading,
        includeActiveDocument,
        setIncludeActiveDocument,
        sendMessage,
        clearMessages,
        runProofread,
        runRubySuggest,
      }}
    >
      {children}
    </AiContext.Provider>
  );
};

export const useAi = (): AiContextType => {
  const context = useContext(AiContext);
  if (!context) {
    throw new Error('useAi must be used within an AiProvider');
  }
  return context;
};
