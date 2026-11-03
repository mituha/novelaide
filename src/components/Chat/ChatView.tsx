import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';
import { useSettings } from 'restar-app-settings';
import { fileService } from '../../services/fileService';
import { DirEntry } from '../../types/document';
import {
  ChFileStructure,
  ChatMessage,
  ChatMessagePart,
  DEFAULT_STATIC_PERSONAS,
  ContextTargetMode,
} from './ChatTypes';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { AIChatInput } from './AIChatInput';
import { DocSummary } from './AIContextSelector';
import { ProofreadActionToolbar } from './ProofreadActionToolbar';
import {
  PiWritingAgentSession,
  UIDocumentContext,
  convertChMessagesToPiMessages,
} from 'tauri-plugin-novelaid-ai-api';
import './ChatView.css';

interface ChatViewProps {
  content?: string;
  path?: string;
  baseName?: string;
  onChangeContent?: (newContent: string) => void;
  isReadOnly?: boolean;
  onExportToFile?: () => void;
  showExportButton?: boolean;
  isExporting?: boolean;
}

const formatTimestamp = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${y}${m}${day}${h}${min}${s}`;
};

// 初期の空ドキュメント用ファクトリ
function createDefaultStructure(fallbackTitle?: string): ChFileStructure {
  const now = formatTimestamp();
  return {
    version: '1.0',
    metadata: {
      title: fallbackTitle || 'AI執筆相談',
      createdAt: now,
      updatedAt: now,
      defaultPersonaId: 'partner',
      defaultRoleId: 'assistant',
      parameters: {
        useTools: true,
        useReasoning: true,
      },
    },
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        persona: 'partner',
        content: 'こんにちは！執筆パートナーです。プロットの構想やセリフの推敲、ルビ振りなど何でもお気軽にご相談ください。',
        parts: [
          {
            type: 'text',
            content: 'こんにちは！執筆パートナーです。プロットの構想やセリフの推敲、ルビ振りなど何でもお気軽にご相談ください。',
          },
        ],
        timestamp: now,
      },
    ],
  };
}

/**
 * 読み込んだ生のJSONや旧形式データを安全に ChFileStructure に正規化する
 */
function normalizeChData(raw: any, fallbackTitle?: string): ChFileStructure {
  const defaultStruct = createDefaultStructure(fallbackTitle);
  if (!raw || typeof raw !== 'object') {
    return defaultStruct;
  }

  // 以前のチャットデータ形式（単なるメッセージ配列 []）の救済
  if (Array.isArray(raw)) {
    return {
      ...defaultStruct,
      messages: raw.length > 0 ? raw : defaultStruct.messages,
    };
  }

  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const messages = Array.isArray(raw.messages) ? raw.messages : defaultStruct.messages;

  return {
    version: typeof raw.version === 'string' ? raw.version : '1.0',
    metadata: {
      title: metadata.title || fallbackTitle || 'AI執筆相談',
      createdAt: metadata.createdAt || defaultStruct.metadata.createdAt,
      updatedAt: metadata.updatedAt || defaultStruct.metadata.updatedAt,
      defaultPersonaId: metadata.defaultPersonaId || 'partner',
      defaultRoleId: metadata.defaultRoleId || 'assistant',
      parameters: {
        useTools: metadata.parameters?.useTools ?? true,
        useReasoning: metadata.parameters?.useReasoning ?? true,
        ...metadata.parameters,
      },
    },
    messages,
  };
}

export const ChatView: React.FC<ChatViewProps> = ({
  content,
  path = '',
  baseName = '',
  isReadOnly = false,
  onChangeContent,
  showExportButton = false,
  onExportToFile,
  isExporting = false,
}) => {
  const { openDocuments, activeDocument, activeLeftItem, activeRightItem, openDocument, updateContent } = useDocument();
  const { projectPath } = useProject();

  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [toolsPermission, setToolsPermission] = useState<'none' | 'read' | 'write'>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      if (parsed?.metadata?.parameters?.toolsPermission) {
        return parsed.metadata.parameters.toolsPermission;
      }
      if (parsed?.metadata?.parameters?.useTools === false) return 'none';
      if (parsed?.metadata?.parameters?.allowWrite) return 'write';
      return 'read';
    } catch {
      return 'read';
    }
  });
  const allowWrite = toolsPermission === 'write';

  const [useReasoning, setUseReasoning] = useState<boolean>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      return parsed?.metadata?.parameters?.useReasoning ?? true;
    } catch {
      return true;
    }
  });

  const sessionRef = useRef<PiWritingAgentSession | null>(null);
  const currentSessionPathRef = useRef<string | undefined>(path);
  const projectFilesRef = useRef<Array<{ path: string; relativePath: string; name: string; stem: string }>>([]);

  // ドキュメント切り替え時にセッションをリセット
  useEffect(() => {
    if (currentSessionPathRef.current !== path) {
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
      currentSessionPathRef.current = path;
    }
  }, [path]);

  // コンポーネント破棄時のクリーンアップ
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
    };
  }, []);
  const [contextMode, setContextMode] = useState<ContextTargetMode>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      return parsed?.metadata?.contextMode ?? 'active';
    } catch {
      return 'active';
    }
  });
  const [includeFullText, setIncludeFullText] = useState<boolean>(() => {
    try {
      const parsed = content ? JSON.parse(content) : null;
      return parsed?.metadata?.includeFullText ?? true;
    } catch {
      return true;
    }
  });
  const [availableFilesSummary, setAvailableFilesSummary] = useState<string>('');

  const activeAssistantMsgIdRef = useRef<string | null>(null);

  const defaultTitle = baseName ? fileService.stem(baseName) : 'AI執筆相談';

  const [fileData, setFileData] = useState<ChFileStructure>(() => {
    if (!content || !content.trim()) {
      return createDefaultStructure(defaultTitle);
    }
    try {
      const parsed = JSON.parse(content);
      return normalizeChData(parsed, defaultTitle);
    } catch {
      return createDefaultStructure(defaultTitle);
    }
  });

  // 外部からの content 変更を検知して同期
  useEffect(() => {
    if (!content || !content.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(content);
      const normalized = normalizeChData(parsed, defaultTitle);
      setFileData(normalized);
      if (normalized.metadata?.parameters?.toolsPermission !== undefined) {
        setToolsPermission(normalized.metadata.parameters.toolsPermission);
      } else {
        if (normalized.metadata?.parameters?.useTools === false) {
          setToolsPermission('none');
        } else if (normalized.metadata?.parameters?.allowWrite) {
          setToolsPermission('write');
        }
      }
      if (normalized.metadata?.parameters?.useReasoning !== undefined) {
        setUseReasoning(normalized.metadata.parameters.useReasoning);
      }
      if (normalized.metadata?.contextMode !== undefined) {
        setContextMode(normalized.metadata.contextMode);
      }
      if (normalized.metadata?.includeFullText !== undefined) {
        setIncludeFullText(normalized.metadata.includeFullText);
      }
    } catch (e) {
      console.warn('Failed to parse .ch content JSON:', e);
    }
  }, [content, defaultTitle]);

  // プロジェクト内のファイル一覧（原稿・設定・プロット等）を収集して目次サマリーを生成
  useEffect(() => {
    let isMounted = true;
    const loadProjectOverview = async () => {
      if (!projectPath) {
        // プロジェクト外の場合は開いているドキュメント一覧のみ
        const openSummary = openDocuments
          .map((d) => `- ${d.fileTitle} (${d.path}, 未保存: ${d.isDirty ? 'あり' : 'なし'})`)
          .join('\n');
        if (isMounted) setAvailableFilesSummary(openSummary ? `【現在開いているファイル】\n${openSummary}` : '');
        return;
      }

      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const fileList: string[] = [];
        const allFiles: Array<{ path: string; relativePath: string; name: string; stem: string }> = [];

        const collectFiles = (items: DirEntry[]) => {
          for (const item of items) {
            if (item.isDirectory) {
              if (item.name === '.git' || item.name === 'node_modules') continue;
              if (item.children) collectFiles(item.children);
            } else {
              const ext = (item.extension || '').toLowerCase();
              if (['txt', 'md', 'json', 'ch', 'yaml', 'yml'].includes(ext)) {
                const titlePart = item.fileTitle && item.fileTitle !== item.baseName ? ` [${item.fileTitle}]` : '';
                fileList.push(`- ${item.relativePath || item.name}${titlePart}`);
                allFiles.push({
                  path: item.path,
                  relativePath: item.relativePath || item.name,
                  name: item.name,
                  stem: item.fileTitle || fileService.stem(item.name),
                });
              }
            }
          }
        };

        collectFiles(entries);
        projectFilesRef.current = allFiles;
        if (isMounted) {
          const summary = [
            '【プロジェクト構造・参照可能ファイル一覧】',
            ...fileList.slice(0, 50),
            fileList.length > 50 ? `...他 ${fileList.length - 50} 件` : '',
          ]
            .filter(Boolean)
            .join('\n');
          setAvailableFilesSummary(summary);
        }
      } catch (e) {
        console.warn('[ChatView] Failed to collect project overview:', e);
      }
    };

    loadProjectOverview();
    return () => {
      isMounted = false;
    };
  }, [projectPath, openDocuments.length]);

  // 各ペインのドキュメントサマリーの算出
  const leftDocInfo: DocSummary | null = useMemo(() => {
    if (!activeLeftItem) return null;
    const doc = openDocuments.find((d) => d.path === activeLeftItem.path);
    if (!doc) return null;
    return {
      title: doc.fileTitle || doc.baseName,
      length: doc.content.length,
      path: doc.path,
    };
  }, [activeLeftItem, openDocuments]);

  const rightDocInfo: DocSummary | null = useMemo(() => {
    if (!activeRightItem) return null;
    const doc = openDocuments.find((d) => d.path === activeRightItem.path);
    if (!doc) return null;
    return {
      title: doc.fileTitle || doc.baseName,
      length: doc.content.length,
      path: doc.path,
    };
  }, [activeRightItem, openDocuments]);

  const activeDocInfo: DocSummary | null = useMemo(() => {
    if (!activeDocument) return null;
    return {
      title: activeDocument.fileTitle || activeDocument.baseName,
      length: activeDocument.content.length,
      path: activeDocument.path,
    };
  }, [activeDocument]);

  // ファイルデータ保存
  const saveFile = useCallback(
    (newData: ChFileStructure) => {
      const currentMeta = newData?.metadata || {};
      const updated: ChFileStructure = {
        ...newData,
        version: newData?.version || '1.0',
        metadata: {
          ...currentMeta,
          updatedAt: formatTimestamp(),
        },
        messages: newData?.messages || [],
      };
      setFileData(updated);
      if (onChangeContent) {
        onChangeContent(JSON.stringify(updated, null, 2));
      }
    },
    [onChangeContent]
  );

  const handleContextModeChange = useCallback(
    (newMode: ContextTargetMode) => {
      setContextMode(newMode);
      saveFile({
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          contextMode: newMode,
        },
      });
    },
    [fileData, saveFile]
  );

  const handleIncludeFullTextChange = useCallback(
    (include: boolean) => {
      setIncludeFullText(include);
      saveFile({
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          includeFullText: include,
        },
      });
    },
    [fileData, saveFile]
  );

  const currentPersonaId = fileData?.metadata?.defaultPersonaId || 'partner';
  const currentPersona =
    DEFAULT_STATIC_PERSONAS.find((p) => p.id === currentPersonaId) || DEFAULT_STATIC_PERSONAS[0];

  const { settings } = useSettings();
  const scopedModels: string[] = useMemo(() => {
    if (Array.isArray(settings.aiScopedModels) && settings.aiScopedModels.length > 0) {
      return settings.aiScopedModels;
    }
    return ['gemini:gemini-2.5-flash', 'gemini:gemini-2.5-pro', 'lm-studio:qwen2.5-7b-instruct'];
  }, [settings.aiScopedModels]);

  const defaultModelKey = settings.aiDefaultModel || scopedModels[0] || 'gemini:gemini-2.5-flash';
  const lmStudioUrl = settings.aiLmStudioUrl || 'http://localhost:1234/v1';
  const geminiApiKey = settings.aiGeminiApiKey || '';

  // ドキュメントに保存されているモデルまたは設定のデフォルト
  const currentModelKey = useMemo(() => {
    const params = fileData?.metadata?.parameters;
    if (params?.model) {
      if (params.provider) {
        return `${params.provider}:${params.model}`;
      }
      return params.model.includes(':') ? params.model : `gemini:${params.model}`;
    }
    return defaultModelKey;
  }, [fileData?.metadata?.parameters, defaultModelKey]);

  const handleModelChange = useCallback(
    (newKey: string) => {
      const parts = newKey.split(':');
      const provider = parts.length > 1 ? parts[0] : 'gemini';
      const model = parts.length > 1 ? parts[1] : parts[0];

      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            provider,
            model,
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  const handlePersonaChange = (id: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...(fileData?.metadata || {}),
        defaultPersonaId: id,
      },
    };
    saveFile(next);
  };

  const handleTitleChange = (newTitle: string) => {
    const next: ChFileStructure = {
      ...fileData,
      metadata: {
        ...(fileData?.metadata || {}),
        title: newTitle,
      },
    };
    saveFile(next);
  };

  const handleMessagesChange = (newMessages: ChatMessage[]) => {
    const next: ChFileStructure = {
      ...fileData,
      messages: newMessages,
    };
    saveFile(next);
    if (sessionRef.current) {
      sessionRef.current.setHistoryMessages(newMessages);
    }
  };

  const handleUseReasoningChange = useCallback(
    (newVal: boolean) => {
      setUseReasoning(newVal);
      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            useReasoning: newVal,
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  const handleToolsPermissionChange = useCallback(
    (newPerm: 'none' | 'read' | 'write') => {
      setToolsPermission(newPerm);
      const next: ChFileStructure = {
        ...fileData,
        metadata: {
          ...(fileData?.metadata || {}),
          parameters: {
            ...(fileData?.metadata?.parameters || {}),
            toolsPermission: newPerm,
            useTools: newPerm !== 'none',
            allowWrite: newPerm === 'write',
          },
        },
      };
      saveFile(next);
    },
    [fileData, saveFile]
  );

  // ツール実行ハンドラー（DocumentState / DocumentContext を唯一の信頼源とする安全パイプライン）
  const toolExecutor = useCallback(
    async (toolName: string, args: Record<string, any> = {}) => {
      console.group(`%c[ChatView:ToolExecutor] ツール呼び出し受信 🛠️: ${toolName}`, 'color: #3b82f6; font-weight: bold;');
      console.log('▶ 呼び出しツール:', toolName);
      console.log('▶ 渡された引数 (args):', args);
      console.log('▶ 編集権限 (allowWrite):', allowWrite);
      console.groupEnd();

      // 空白・アンダースコア・ハイフン・中黒記号等を除去して小文字化した正規化キー生成
      const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-・　]/g, '');

      // 実在ファイルまたは開いているドキュメントの安全な解決ヘルパー（表記揺れ・空白混入に対応）
      const resolveFile = (rawPath: string) => {
        if (!rawPath || !rawPath.trim()) {
          return { found: false, candidates: [] as string[] };
        }
        const target = rawPath.trim();
        const targetBase = fileService.basename(target);
        const targetStem = fileService.stem(target);
        const targetNorm = normalize(target);
        const targetBaseNorm = normalize(targetBase);
        const targetStemNorm = normalize(targetStem);

        // 1. openDocuments（現在開いているファイル・未保存バッファ）から探索
        // 1-1. パス、ベース名、タイトル完全一致
        let doc = openDocuments.find(
          (d) =>
            d.path === target ||
            d.relativePath === target ||
            fileService.basename(d.path) === targetBase ||
            fileService.stem(d.path) === targetStem ||
            d.fileTitle === target
        );
        if (doc) {
          return { found: true, doc, resolvedPath: doc.path, candidates: [] as string[] };
        }

        // 1-2. openDocuments 内の正規化キー一致（空白「第 166 話」等）
        doc = openDocuments.find((d) => {
          const normTitle = normalize(d.fileTitle);
          const normBase = normalize(d.baseName);
          const normStem = normalize(fileService.stem(d.path));
          return (
            normTitle === targetNorm ||
            normTitle === targetStemNorm ||
            normBase === targetBaseNorm ||
            normStem === targetStemNorm ||
            (targetNorm.length >= 3 && normTitle.includes(targetNorm)) ||
            (targetNorm.length >= 3 && targetNorm.includes(normTitle))
          );
        });
        if (doc) {
          return { found: true, doc, resolvedPath: doc.path, isNormalized: true, candidates: [] as string[] };
        }

        // 2. プロジェクト内の実在ファイル群から探索
        const files = projectFilesRef.current;
        // 2-1. 完全一致
        const exactMatch = files.find(
          (f) =>
            f.path === target ||
            f.relativePath === target ||
            f.name.toLowerCase() === targetBase.toLowerCase() ||
            f.stem.toLowerCase() === targetStem.toLowerCase()
        );
        if (exactMatch) {
          return { found: true, resolvedPath: exactMatch.path, candidates: [] as string[] };
        }

        // 2-2. 拡張子補完（.txt, .md）
        const extMatch = files.find(
          (f) =>
            f.relativePath === `${target}.txt` ||
            f.relativePath === `${target}.md` ||
            f.name === `${targetBase}.txt` ||
            f.name === `${targetBase}.md`
        );
        if (extMatch) {
          return { found: true, resolvedPath: extMatch.path, isNormalized: true, candidates: [] as string[] };
        }

        // 2-3. 正規化キー完全一致（「第 166 話」と「第166話」の空白・記号差異を吸収）
        const normMatches = files.filter((f) => {
          const fnNorm = normalize(f.name);
          const fsNorm = normalize(f.stem);
          return (
            fnNorm === targetNorm ||
            fsNorm === targetNorm ||
            fnNorm === targetBaseNorm ||
            fsNorm === targetStemNorm
          );
        });
        if (normMatches.length === 1) {
          return { found: true, resolvedPath: normMatches[0].path, isNormalized: true, candidates: [] as string[] };
        }

        // 2-4. 正規化キーによる包含マッチング
        const partialMatches = files.filter((f) => {
          const fnNorm = normalize(f.name);
          const fsNorm = normalize(f.stem);
          return (
            (targetNorm.length >= 3 && fnNorm.includes(targetNorm)) ||
            (targetNorm.length >= 3 && fsNorm.includes(targetNorm)) ||
            (targetStemNorm.length >= 3 && fnNorm.includes(targetStemNorm)) ||
            (targetStemNorm.length >= 3 && fsNorm.includes(targetStemNorm)) ||
            (fsNorm.length >= 3 && targetNorm.includes(fsNorm))
          );
        });

        if (partialMatches.length === 1) {
          return { found: true, resolvedPath: partialMatches[0].path, isNormalized: true, candidates: [] as string[] };
        }

        // 候補一覧の生成（最大5件）
        const candidates = (partialMatches.length > 0 ? partialMatches : files)
          .filter((f) => {
            const fnNorm = normalize(f.name);
            return targetNorm.length >= 2 && fnNorm.includes(targetNorm.slice(0, 3));
          })
          .slice(0, 5)
          .map((f) => f.relativePath || f.name);

        return { found: false, candidates };
      };

      // --- スコープ境界ガード ---
      const validateScope = (targetPath: string): { allowed: boolean; reason?: string } => {
        if (!targetPath) return { allowed: false, reason: '対象パスが指定されていません。' };
        // プロジェクト外脱出防止
        if (targetPath.includes('..') || targetPath.startsWith('/') || targetPath.match(/^[a-zA-Z]:/)) {
          return { allowed: false, reason: 'プロジェクトルート外へのアクセスは禁止されています。' };
        }

        // 許可フォルダー: 設定資料フォルダー（00_settings, settings, plot, 10_plot, wiki 等）
        const isSettings = /^(?:00_settings|settings|plot|10_plot|wiki|character|world)/i.test(targetPath);
        if (isSettings) return { allowed: true };

        // 許可フォルダー: 現在作業中のドキュメントと同一フォルダー
        const currentActivePath = activeDocument?.path || path;
        if (currentActivePath) {
          const activeDir = fileService.dirname(currentActivePath);
          const targetDir = fileService.dirname(targetPath);
          if (activeDir === targetDir || targetPath.startsWith(activeDir)) {
            return { allowed: true };
          }
        }

        // 単一ファイル名のみの場合（カレントフォルダー内と判定）
        if (!targetPath.includes('/') && !targetPath.includes('\\')) {
          return { allowed: true };
        }

        return {
          allowed: false,
          reason: `アクセス制限: 現在の作業フォルダーおよび設定フォルダー外（${targetPath}）へのアクセスは遮断されています。`,
        };
      };

      // 1. read ツール
      if (toolName === 'read') {
        const targetPath = args.path;
        const scopeCheck = validateScope(targetPath);
        if (!scopeCheck.allowed) {
          return { status: 'error', message: scopeCheck.reason };
        }

        const resolved = resolveFile(targetPath);
        if (!resolved.found || !resolved.resolvedPath) {
          // ★実在しない場合は openDocument を絶対に呼ばず、即座にエラーと候補を返却！
          const candidatesMsg =
            resolved.candidates.length > 0
              ? `\n【もしかして以下のファイルですか？】\n${resolved.candidates.map((c) => `- ${c}`).join('\n')}`
              : '';
          return {
            status: 'error',
            message: `指定されたファイル [${targetPath}] が見つかりませんでした。${candidatesMsg}`,
            candidates: resolved.candidates.length > 0 ? resolved.candidates : undefined,
            hint:
              resolved.candidates.length > 0
                ? '上記の候補一覧から正確なファイル名（拡張子含む）を指定して再試行してください。'
                : 'プロジェクト構造内に該当ファイルが見つかりません。ファイル名と拡張子（.txt や .md）を確認してください。',
          };
        }

        let doc = resolved.doc;
        if (!doc) {
          try {
            await openDocument(resolved.resolvedPath);
            doc = openDocuments.find((d) => d.path === resolved.resolvedPath);
          } catch (e: any) {
            return { status: 'error', message: `ドキュメントのオープンに失敗しました: ${e.message}` };
          }
        }

        const fullContent = doc ? doc.content : '';
        const lines = fullContent.split('\n');
        const offset = typeof args.offset === 'number' && args.offset > 0 ? args.offset - 1 : 0;
        const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : lines.length;
        const sliced = lines.slice(offset, offset + limit).join('\n');

        const readResult: Record<string, any> = {
          status: 'success',
          path: resolved.resolvedPath,
          totalLines: lines.length,
          returnedLines: Math.min(limit, lines.length - offset),
          content: sliced,
        };
        if (resolved.isNormalized) {
          readResult.note = `ファイル名表記の揺れ（空白や記号の差）を補正して [${resolved.resolvedPath}] を読み込みました。`;
        }
        console.log(`%c[ChatView:ToolExecutor] read 完了 (${readResult.returnedLines}行返却)`, 'color: #10b981;', readResult);
        return readResult;
      }

      // 2. write ツール
      if (toolName === 'write') {
        if (!allowWrite) {
          return { status: 'error', message: '書き込み権限がありません（直接編集が無効化されています）。' };
        }
        const targetPath = args.path;
        const scopeCheck = validateScope(targetPath);
        if (!scopeCheck.allowed) {
          return { status: 'error', message: scopeCheck.reason };
        }

        const resolved = resolveFile(targetPath);
        const resolvedPath = resolved.found && resolved.resolvedPath ? resolved.resolvedPath : targetPath;

        let doc = resolved.doc;
        if (!doc) {
          try {
            await openDocument(resolvedPath);
            doc = openDocuments.find((d) => d.path === resolvedPath);
          } catch {
            // 新規作成などの場合
          }
        }

        const finalPath = doc?.path || resolvedPath;
        updateContent(finalPath, args.content || '');

        const writeResult: Record<string, any> = {
          status: 'success',
          path: finalPath,
          message: `ドキュメント [${finalPath}] の内容を更新しました（未保存状態・エディター即座同期）。`,
        };
        if (resolved.isNormalized) {
          writeResult.note = `ファイル名表記の揺れ（空白や記号の差）を補正して [${finalPath}] に書き込みました。`;
        }
        console.log(`%c[ChatView:ToolExecutor] write 完了`, 'color: #10b981;', writeResult);
        return writeResult;
      }

      // 3. edit ツール
      if (toolName === 'edit') {
        if (!allowWrite) {
          return { status: 'error', message: '書き込み権限がありません（直接編集が無効化されています）。' };
        }
        const targetPath = args.path;
        const scopeCheck = validateScope(targetPath);
        if (!scopeCheck.allowed) {
          return { status: 'error', message: scopeCheck.reason };
        }

        const resolved = resolveFile(targetPath);
        if (!resolved.found || !resolved.resolvedPath) {
          const candidatesMsg =
            resolved.candidates.length > 0
              ? `\n【もしかして以下のファイルですか？】\n${resolved.candidates.map((c) => `- ${c}`).join('\n')}`
              : '';
          return {
            status: 'error',
            message: `編集対象のファイル [${targetPath}] が見つかりませんでした。${candidatesMsg}`,
            candidates: resolved.candidates.length > 0 ? resolved.candidates : undefined,
          };
        }

        let doc = resolved.doc;
        if (!doc) {
          try {
            await openDocument(resolved.resolvedPath);
            doc = openDocuments.find((d) => d.path === resolved.resolvedPath);
          } catch (e: any) {
            return { status: 'error', message: `ドキュメント [${targetPath}] が見つかりませんでした。` };
          }
        }

        if (!doc) {
          return { status: 'error', message: `ドキュメント [${targetPath}] が見つかりませんでした。` };
        }

        let currentText = doc.content;
        const edits = Array.isArray(args.edits) ? args.edits : [];
        let appliedCount = 0;

        for (const edit of edits) {
          if (!edit.oldText) continue;
          if (!currentText.includes(edit.oldText)) {
            return {
              status: 'error',
              message: `差分置換エラー: 原稿内に指定されたテキスト [${edit.oldText.slice(0, 30)}...] が見つかりませんでした。`,
              appliedEdits: appliedCount,
            };
          }
          currentText = currentText.replace(edit.oldText, edit.newText || '');
          appliedCount++;
        }

        updateContent(doc.path, currentText);

        const editResult: Record<string, any> = {
          status: 'success',
          path: doc.path,
          appliedEdits: appliedCount,
          message: `${appliedCount} 件の差分編集を適用しました（未保存状態・エディター即座同期）。`,
        };
        if (resolved.isNormalized) {
          editResult.note = `ファイル名表記の揺れ（空白や記号の差）を補正して [${doc.path}] を編集しました。`;
        }
        console.log(`%c[ChatView:ToolExecutor] edit 完了 (${appliedCount}件適用)`, 'color: #10b981;', editResult);
        return editResult;
      }

      // 4. search_metadata ツール
      if (toolName === 'search_metadata') {
        const query = String(args.query || '').trim().toLowerCase();
        const matched = openDocuments.filter(
          (d) =>
            d.path.includes('setting') ||
            d.path.includes('plot') ||
            d.fileTitle.toLowerCase().includes(query) ||
            d.content.toLowerCase().includes(query)
        );

        const results = matched.slice(0, 5).map((d) => ({
          title: d.fileTitle,
          path: d.path,
          preview: d.content.slice(0, 200).replace(/\n/g, ' ') + '...',
        }));

        return {
          status: 'success',
          query,
          matchCount: results.length,
          results,
        };
      }

      // 5. scan_proofread ツール
      if (toolName === 'scan_proofread') {
        const targetText = args.text || activeDocument?.content || '';
        const lines = targetText.split('\n');
        const issues: any[] = [];
        let taStreak = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.endsWith('た。') || line.endsWith('だ。')) {
            taStreak++;
            if (taStreak >= 3) {
              issues.push({
                line: i + 1,
                type: 'consecutive_past_tense',
                message: `文末の過去形（〜た。/〜だ。）が ${taStreak} 回連続しています。`,
                snippet: line,
              });
            }
          } else if (line.length > 0) {
            taStreak = 0;
          }
        }
        return { status: 'success', issues, totalIssues: issues.length };
      }

      // 6. extract_ruby ツール
      if (toolName === 'extract_ruby') {
        const targetText = args.text || activeDocument?.content || '';
        const kanjiMatch = targetText.match(/[\u4e00-\u9faf]{2,}/g) || [];
        const uniqueWords = Array.from(new Set(kanjiMatch)).slice(0, 10);
        const candidates = uniqueWords.map((w) => ({
          word: w,
          ruby: '？？',
          formatted: `|${w}《？？》`,
        }));
        return { status: 'success', candidates, totalCandidates: candidates.length };
      }

      return { status: 'error', message: `未対応のツールです: ${toolName}` };
    },
    [openDocuments, openDocument, updateContent, activeDocument, path, allowWrite]
  );

  // メッセージ送信
  const handleSend = async (overridePrompt?: string) => {
    const rawText = overridePrompt !== undefined ? overridePrompt : input;
    if (!rawText.trim() || isStreaming || isReadOnly) return;

    const userText = rawText.trim();
    if (overridePrompt === undefined) {
      setInput('');
    }

    // コンテキストの収集（contextMode および includeFullText に基づく）
    let contextContent = '';
    if (contextMode !== 'none') {
      const selectedDocs: Array<{ title: string; path: string; content: string; label: string }> = [];

      if (contextMode === 'left' || contextMode === 'both') {
        if (activeLeftItem && activeLeftItem.path !== path) {
          const doc = openDocuments.find((d) => d.path === activeLeftItem.path);
          if (doc) selectedDocs.push({ label: '左ペイン原稿', title: doc.fileTitle, path: doc.path, content: doc.content });
        }
      }
      if (contextMode === 'right' || contextMode === 'both') {
        if (activeRightItem && activeRightItem.path !== path) {
          const doc = openDocuments.find((d) => d.path === activeRightItem.path);
          if (doc) selectedDocs.push({ label: '右ペイン原稿/設定', title: doc.fileTitle, path: doc.path, content: doc.content });
        }
      }
      if (contextMode === 'active' || selectedDocs.length === 0) {
        if (activeDocument && activeDocument.path !== path) {
          selectedDocs.push({
            label: 'アクティブ原稿',
            title: activeDocument.fileTitle,
            path: activeDocument.path,
            content: activeDocument.content,
          });
        }
      }

      if (selectedDocs.length > 0) {
        if (includeFullText) {
          // プッシュ型全文注入
          contextContent = selectedDocs
            .map((d) => `【${d.label}: ${d.title} (${d.path})】\n${d.content}`)
            .join('\n\n---\n\n');
        } else {
          // 目次・参照案内のみ（プル型）
          contextContent = [
            '【参照対象ドキュメント概要 (本文は read ツール等で必要に応じて取得してください)】',
            ...selectedDocs.map(
              (d) => `- [${d.label}] ${d.title} (パス: ${d.path}, 文字数: ${d.content.length.toLocaleString()}文字)`
            ),
          ].join('\n');
        }
      }
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      parts: [{ type: 'text', content: userText }],
      timestamp: formatTimestamp(),
    };

    const assistantMsgId = `asst-${Date.now() + 1}`;
    activeAssistantMsgIdRef.current = assistantMsgId;

    const initialParts: ChatMessagePart[] = [];
    if (useReasoning) {
      initialParts.push({ type: 'thought', content: '' });
    }
    initialParts.push({ type: 'text', content: '' });

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      persona: currentPersonaId,
      agentId: currentPersonaId,
      name: currentPersona.name,
      content: '',
      parts: initialParts,
      timestamp: formatTimestamp(),
    };

    const nextData: ChFileStructure = {
      ...fileData,
      messages: [...(fileData?.messages || []), userMsg, assistantMsg],
    };

    setFileData(nextData);
    saveFile(nextData);
    setIsStreaming(true);

    try {
      const uiDocumentContext: UIDocumentContext = {
        getOpenDocuments: () =>
          openDocuments.map((d) => ({
            path: d.path,
            title: d.fileTitle || d.baseName,
            isDirty: d.isDirty,
          })),
        getActiveDocument: () =>
          activeDocument
            ? {
                path: activeDocument.path,
                title: activeDocument.fileTitle || activeDocument.baseName,
                content: activeDocument.content,
                isDirty: activeDocument.isDirty,
              }
            : null,
      };

      // 選択中のプロバイダー・モデルの解決
      const parts = currentModelKey.split(':');
      const targetProvider = parts.length > 1 ? parts[0] : 'gemini';
      const targetModel = parts.length > 1 ? parts[1] : parts[0];

      // PiWritingAgentSession のコールバックとオプション構成
      const sessionOptions = {
        persona: currentPersonaId as any,
        model: targetModel,
        provider: targetProvider as any,
        baseUrl: targetProvider === 'lm-studio' ? lmStudioUrl : undefined,
        apiKey: targetProvider === 'gemini' ? geminiApiKey : undefined,
        useReasoning,
        toolsPermission,
        toolExecutor,
        contextContent,
        availableFilesSummary,
        uiDocumentContext,
        onThoughtToken: (thoughtDelta: string) => {
          if (!useReasoning) return;

          setFileData((prev) => {
            const updatedMessages = prev.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;

              const parts = [...(m.parts || [])];
              let thoughtPartIdx = parts.findIndex((p) => p.type === 'thought');

              if (thoughtPartIdx === -1) {
                // 先頭に thought パートを挿入
                parts.unshift({ type: 'thought', content: thoughtDelta });
              } else {
                parts[thoughtPartIdx] = {
                  ...parts[thoughtPartIdx],
                  content: parts[thoughtPartIdx].content + thoughtDelta,
                };
              }

              return {
                ...m,
                parts,
              };
            });

            return {
              ...prev,
              messages: updatedMessages,
            };
          });
        },
        onToken: (delta: string) => {
          setFileData((prev) => {
            const updatedMessages = prev.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;

              const parts = [...(m.parts || [])];
              const textPartIdx = parts.findIndex((p) => p.type === 'text');

              if (textPartIdx !== -1) {
                parts[textPartIdx] = {
                  ...parts[textPartIdx],
                  content: parts[textPartIdx].content + delta,
                };
              } else {
                parts.push({ type: 'text', content: delta });
              }

              return {
                ...m,
                content: (m.content || '') + delta,
                parts,
              };
            });

            return {
              ...prev,
              messages: updatedMessages,
            };
          });
        },
        onEvent: (event: any) => {
          if (event.type === 'tool_call_start') {
            setFileData((prev) => {
              const updatedMessages = prev.messages.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const parts: ChatMessagePart[] = [...(m.parts || [])];
                parts.push({
                  type: 'tool_call',
                  content: `ツール実行: ${event.toolName}`,
                  metadata: {
                    tool_call: {
                      id: String(event.callId || `call_${Date.now()}`),
                      name: event.toolName,
                      arguments: event.args,
                    },
                  },
                });
                return { ...m, parts };
              });
              return { ...prev, messages: updatedMessages };
            });
          } else if (event.type === 'tool_call_end') {
            setFileData((prev) => {
              const updatedMessages = prev.messages.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const parts: ChatMessagePart[] = (m.parts || []).map((p) => {
                  if (
                    p.type === 'tool_call' &&
                    p.metadata &&
                    p.metadata.tool_call &&
                    p.metadata.tool_call.id === event.callId
                  ) {
                    const existingCall = p.metadata.tool_call;
                    return {
                      type: 'tool_call' as const,
                      content: `ツール完了: ${event.toolName}`,
                      metadata: {
                        tool_call: {
                          id: existingCall.id,
                          name: existingCall.name,
                          arguments: existingCall.arguments,
                          result: event.result,
                        },
                      },
                    };
                  }
                  return p;
                });
                return { ...m, parts };
              });
              return { ...prev, messages: updatedMessages };
            });
          }
        },
      };

      // 永続セッションの取得または復元初期化
      let session = sessionRef.current;
      if (!session) {
        // 現在の発話直前までの会話ログを復元
        const previousMessages = fileData?.messages || [];
        const initialMessages = convertChMessagesToPiMessages(previousMessages);
        console.log(`[ChatView] 新規PiWritingAgentSession初期化 (復元メッセージ数: ${initialMessages.length})`);
        session = new PiWritingAgentSession({
          ...sessionOptions,
          initialMessages,
        });
        await session.init();
        sessionRef.current = session;
      } else {
        // 既存セッションが存在する場合はモデルや設定、最新コンテキストのみを更新（会話メモリは保持）
        await session.updateOptions(sessionOptions);
      }

      await session.prompt(userText, contextContent);
    } catch (err: any) {
      console.error('[ChatView] 送信エラー:', err);
      setFileData((prev) => {
        const updatedMessages = prev.messages.map((m) => {
          if (m.id !== assistantMsgId) return m;
          return {
            ...m,
            content: (m.content || '') + `\n\nエラーが発生しました: ${err.message || '通信失敗'}`,
            parts: [
              ...(m.parts || []),
              { type: 'error' as const, content: err.message || '通信失敗' },
            ],
          };
        });
        return { ...prev, messages: updatedMessages };
      });
    } finally {
      setIsStreaming(false);
      // 完了した最新状態をファイルへ最終確定保存（空の thought パートは除去）
      setFileData((current) => {
        const cleanedMessages = current.messages.map((m) => {
          if (!m.parts) return m;
          const filteredParts = m.parts.filter(
            (p) => p.type !== 'thought' || (p.content && p.content.trim().length > 0)
          );
          return { ...m, parts: filteredParts };
        });
        const finalStruct = { ...current, messages: cleanedMessages };
        saveFile(finalStruct);
        return finalStruct;
      });
    }
  };

  return (
    <div className="chat-view-container">
      <ChatHeader
        title={fileData?.metadata?.title || fileService.stem(baseName) || 'チャット'}
        onTitleChange={!isReadOnly ? handleTitleChange : undefined}
        selectedPersonaId={currentPersonaId}
        onPersonaChange={!isReadOnly ? handlePersonaChange : () => {}}
        personas={DEFAULT_STATIC_PERSONAS}
        selectedModelKey={currentModelKey}
        onModelChange={!isReadOnly ? handleModelChange : undefined}
        scopedModels={scopedModels}
        onExportToFile={showExportButton ? onExportToFile : undefined}
        isExporting={isExporting}
      />

      <ChatMessageList
        messages={fileData?.messages || []}
        personas={DEFAULT_STATIC_PERSONAS}
        onMessagesChange={!isReadOnly ? handleMessagesChange : undefined}
        isStreaming={isStreaming}
      />

      {!isReadOnly && (
        <ProofreadActionToolbar
          onTriggerAction={(prompt) => handleSend(prompt)}
          disabled={isStreaming}
          allowWrite={allowWrite}
        />
      )}

      {!isReadOnly && (
        <AIChatInput
          value={input}
          onChange={setInput}
          onSend={() => handleSend()}
          isStreaming={isStreaming}
          toolsPermission={toolsPermission}
          onToolsPermissionChange={!isReadOnly ? handleToolsPermissionChange : undefined}
          useReasoning={useReasoning}
          onUseReasoningChange={!isReadOnly ? handleUseReasoningChange : undefined}
          contextMode={contextMode}
          onContextModeChange={!isReadOnly ? handleContextModeChange : undefined}
          includeFullText={includeFullText}
          onIncludeFullTextChange={!isReadOnly ? handleIncludeFullTextChange : undefined}
          leftDoc={leftDocInfo}
          rightDoc={rightDocInfo}
          activeDoc={activeDocInfo}
        />
      )}
    </div>
  );
};
