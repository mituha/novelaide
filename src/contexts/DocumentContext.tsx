import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { fileService } from '../services/fileService';
import { DocumentState, DocumentViewMode, PaneId, DocumentViewRef } from '../types/document';
import { getInitialViewMode } from '../utils/documentSupport';
import { useNotification } from './NotificationContext';

export type { DocumentState, PaneId, DocumentViewRef };

export interface TabItem {
  path: string;
  baseName: string;
  fileTitle: string;
  documentType: DocumentState['documentType'];
  viewMode: DocumentViewMode;
  isDirty: boolean;
}

interface DocumentContextType {
  // ドキュメント一覧とペイン状態
  openDocuments: DocumentState[];
  activePane: PaneId;
  activePathByPane: Record<PaneId, string | null>;
  isSplit: boolean;
  splitRatio: number;

  // 現在フォーカスされているアクティブ情報（後方互換性兼共通参照）
  activePath: string | null;
  activeDocument: DocumentState | null;
  activeLeftItem: TabItem | null;
  activeRightItem: TabItem | null;
  isSplitActive: boolean;

  // セレクター
  getTabsForPane: (paneId: PaneId) => TabItem[];
  getActiveDocumentForPane: (paneId: PaneId) => DocumentState | null;

  // ドキュメント操作
  openDocument: (
    path: string,
    options?: { paneId?: PaneId; viewMode?: DocumentViewMode }
  ) => Promise<void>;
  closeTab: (path: string, paneId?: PaneId) => Promise<void>;
  closeDocument: (path: string) => Promise<void>;
  closeOtherTabs: (path: string, paneId?: PaneId) => Promise<void>;
  closeRightTabs: (path: string, paneId?: PaneId) => Promise<void>;
  closeLeftTabs: (path: string, paneId?: PaneId) => Promise<void>;
  closeAllTabs: (paneId?: PaneId) => Promise<void>;
  switchTab: (path: string, paneId?: PaneId) => void;
  setActivePane: (paneId: PaneId) => void;
  setActivePath: (path: string) => void;

  // ビューモード & プレビュー & 分割操作
  changeViewMode: (path: string, viewMode: DocumentViewMode, paneId?: PaneId) => void;
  openPreview: (path: string, mode?: 'preview' | 'reader', targetPane?: PaneId) => void;
  openPreviewInOtherPane: (path?: string, fromPane?: PaneId) => void;
  splitToOtherPane: (path?: string, fromPane?: PaneId) => void;
  moveToOtherPane: (path: string, fromPane?: PaneId) => Promise<void>;
  openPreviewInSplit: (path?: string) => void;
  toggleSplitPreview: (path?: string) => void;
  toggleSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  closePane: (paneId: PaneId) => Promise<void>;

  // ドキュメント実体編集・保存・リネーム
  updateContent: (path: string, content: string) => void;
  updateMetadata: (path: string, metadata: Record<string, any>) => void;
  saveDocument: (path?: string, options?: { force?: boolean }) => Promise<void>;
  renameDocument: (oldPath: string, newTitle: string) => Promise<boolean>;
  updateDocumentPath: (oldPath: string, newPath: string) => void;
  setCompositionState: (isComposing: boolean) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast, showBanner, dismissBanner, showStatusMessage } = useNotification();
  const [openDocuments, setOpenDocuments] = useState<DocumentState[]>([]);
  const [activePane, setActivePane] = useState<PaneId>('editor.left');
  const [activePathByPane, setActivePathByPane] = useState<Record<PaneId, string | null>>({
    'editor.left': null,
    'editor.right': null,
  });
  const [isSplit, setIsSplit] = useState<boolean>(false);
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

  const openDocumentsRef = useRef<DocumentState[]>(openDocuments);
  useEffect(() => {
    openDocumentsRef.current = openDocuments;
  }, [openDocuments]);

  // 自己保存中のエコー防止用セット
  const savingPathsRef = useRef<Set<string>>(new Set());

  // 自動保存用タイマーおよび IME 入力状態管理
  const autoSaveTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const isComposingRef = useRef<boolean>(false);

  const clearAutoSaveTimer = useCallback((path: string) => {
    if (autoSaveTimersRef.current[path]) {
      clearTimeout(autoSaveTimersRef.current[path]);
      delete autoSaveTimersRef.current[path];
    }
  }, []);

  // 指定ペインに属するタブ一覧を導出
  const getTabsForPane = useCallback(
    (paneId: PaneId): TabItem[] => {
      const tabs: TabItem[] = [];
      for (const doc of openDocuments) {
        const viewRef = doc.views.find((v) => v.viewId === paneId);
        if (viewRef && viewRef.viewMode !== 'none') {
          tabs.push({
            path: doc.path,
            baseName: doc.baseName,
            fileTitle: doc.fileTitle,
            documentType: doc.documentType,
            viewMode: (viewRef.viewMode || 'editor') as DocumentViewMode,
            isDirty: doc.isDirty,
          });
        }
      }
      return tabs;
    },
    [openDocuments]
  );

  // 各ペインのアクティブドキュメントを取得
  const getActiveDocumentForPane = useCallback(
    (paneId: PaneId): DocumentState | null => {
      const currentPath = activePathByPane[paneId];
      if (!currentPath) return null;
      return openDocuments.find((d) => d.path === currentPath) || null;
    },
    [activePathByPane, openDocuments]
  );

  // 現在フォーカスされているペインのアクティブドキュメント
  const activeDocument = useMemo(() => {
    return getActiveDocumentForPane(activePane);
  }, [getActiveDocumentForPane, activePane]);

  const activePath = useMemo(() => {
    return activePathByPane[activePane];
  }, [activePathByPane, activePane]);

  const activePathRef = useRef<string | null>(activePath);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // 左ペイン・右ペインのアクティブ TabItem
  const activeLeftItem = useMemo<TabItem | null>(() => {
    const doc = getActiveDocumentForPane('editor.left');
    if (!doc) return null;
    const viewRef = doc.views.find((v) => v.viewId === 'editor.left');
    return {
      path: doc.path,
      baseName: doc.baseName,
      fileTitle: doc.fileTitle,
      documentType: doc.documentType,
      viewMode: (viewRef?.viewMode || 'editor') as DocumentViewMode,
      isDirty: doc.isDirty,
    };
  }, [getActiveDocumentForPane]);

  const activeRightItem = useMemo<TabItem | null>(() => {
    if (!isSplit) return null;
    const doc = getActiveDocumentForPane('editor.right');
    if (!doc) return null;
    const viewRef = doc.views.find((v) => v.viewId === 'editor.right');
    return {
      path: doc.path,
      baseName: doc.baseName,
      fileTitle: doc.fileTitle,
      documentType: doc.documentType,
      viewMode: (viewRef?.viewMode || 'preview') as DocumentViewMode,
      isDirty: doc.isDirty,
    };
  }, [getActiveDocumentForPane, isSplit]);

  // 後方互換用
  const isSplitActive = isSplit;

  // ドキュメントを保存（未保存ドキュメントのディスク永続化）
  const saveDocument = useCallback(
    async (path?: string, options?: { force?: boolean }) => {
      const targetPath = path || activePath;
      if (!targetPath) return;

      // クロージャの openDocuments ではなく、常に最新の openDocumentsRef.current から取得
      const docToSave = openDocumentsRef.current.find((doc) => doc.path === targetPath);
      if (!docToSave) return;

      // 自己保存ガードに登録（保存完了後のフォーカス復帰による自己エコーを確実に遮断）
      savingPathsRef.current.add(targetPath);

      // 大幅激減検知セーフティネット（自動保存時のみ検証、手動/force時はスキップ）
      if (!options?.force) {
        const lastLen = docToSave.lastSavedLength ?? docToSave.content.length;
        const currLen = docToSave.content.length;
        const diff = lastLen - currLen;
        const ratio = diff / Math.max(lastLen, 1);

        if (ratio >= 0.30 && diff >= 200) {
          const bannerId = `drastic-decrease-${docToSave.path}`;
          showBanner({
            id: bannerId,
            type: 'warning',
            message: `${docToSave.baseName} の文字数が大幅に減少しています（前回: ${lastLen}字 → 現在: ${currLen}字、-${Math.round(ratio * 100)}%）。この内容で保存しますか？`,
            actions: [
              {
                label: 'そのまま保存',
                onClick: async () => {
                  dismissBanner(bannerId);
                  await saveDocument(docToSave.path, { force: true });
                },
              },
              {
                label: '保留',
                primary: true,
                onClick: () => {
                  dismissBanner(bannerId);
                },
              },
            ],
          });
          savingPathsRef.current.delete(targetPath);
          return;
        }
      }

      console.log('[DocumentContext] Save Start:', targetPath, {
        length: docToSave.content.length,
        isDirty: docToSave.isDirty,
      });

      try {
        const mtime = await fileService.writeFile(
          docToSave.absolutePath || docToSave.path,
          docToSave.content,
          docToSave.metadata,
          docToSave
        );

        // openDocumentsRef.current を同期的に即座に更新
        openDocumentsRef.current = openDocumentsRef.current.map((doc) => {
          if (doc.path === targetPath) {
            return {
              ...doc,
              isDirty: false,
              mtime,
              lastSavedLength: doc.content.length,
            };
          }
          return doc;
        });

        // React state を更新して UI（未保存マーク等）へ反映
        setOpenDocuments((prev) =>
          prev.map((doc) => {
            if (doc.path === targetPath) {
              return {
                ...doc,
                isDirty: false,
                mtime,
                lastSavedLength: doc.content.length,
              };
            }
            return doc;
          })
        );

        console.log('[DocumentContext] Save Success:', targetPath, {
          mtime,
          length: docToSave.content.length,
        });

        const displayTitle = docToSave.fileTitle || docToSave.baseName;
        showStatusMessage(`保存完了: ${displayTitle}`, 2500);
      } catch (err) {
        console.error('[DocumentContext] Save Error:', err);
        showToast({
          type: 'error',
          message: `保存に失敗しました: ${String(err)}`,
        });
      } finally {
        // 保存直後のファイルシステム遅延やフォーカス復帰エコーを防ぐため800ms保持
        setTimeout(() => {
          savingPathsRef.current.delete(targetPath);
        }, 800);
      }
    },
    [activePath, showBanner, dismissBanner, showStatusMessage, showToast]
  );

  // ファイルを開く（参照カウント式）
  const openDocument = useCallback(
    async (path: string, options?: { paneId?: PaneId; viewMode?: DocumentViewMode }) => {
      const targetPane = options?.paneId || activePane;
      const existing = openDocuments.find((doc) => doc.path === path);

      if (existing) {
        const mode = options?.viewMode || getInitialViewMode(existing.documentType);
        setOpenDocuments((prev) =>
          prev.map((doc) => {
            if (doc.path === path) {
              const viewExists = doc.views.some((v) => v.viewId === targetPane);
              const nextViews = viewExists
                ? doc.views.map((v) => (v.viewId === targetPane ? { ...v, viewMode: mode } : v))
                : [...doc.views, { viewId: targetPane, viewMode: mode }];
              return {
                ...doc,
                views: nextViews,
                leftViewMode: nextViews.find((v) => v.viewId === 'editor.left')?.viewMode || 'none',
                rightViewMode: nextViews.find((v) => v.viewId === 'editor.right')?.viewMode || 'none',
              };
            }
            return doc;
          })
        );
      } else {
        try {
          const fileData = await fileService.readFile(path);
          const mode = options?.viewMode || getInitialViewMode(fileData.documentType);

          const newDoc: DocumentState = {
            path: fileData.path,
            relativePath: fileData.relativePath || fileData.path,
            absolutePath: fileData.absolutePath || fileData.path,
            projectPath: fileData.projectPath || '',
            relativeParentDir: fileData.relativeParentDir || '',
            parentDir: fileData.parentDir || '',
            baseName: fileData.baseName,
            fileTitle: fileData.fileTitle,
            extension: fileData.extension || '',
            content: fileData.content,
            metadata: fileData.metadata || {},
            documentType: fileData.documentType,
            isDirty: false,
            mtime: fileData.mtimeMs,
            lastSavedLength: fileData.content.length,
            views: [{ viewId: targetPane, viewMode: mode }],
            leftViewMode: targetPane === 'editor.left' ? mode : 'none',
            rightViewMode: targetPane === 'editor.right' ? mode : 'none',
          };

          // openDocumentsRef.current にも即時反映
          openDocumentsRef.current = [...openDocumentsRef.current, newDoc];
          setOpenDocuments((prev) => [...prev, newDoc]);

          console.log('[DocumentContext] Read Success:', path, {
            mtime: fileData.mtimeMs,
            length: fileData.content.length,
          });
          const displayTitle = fileData.fileTitle || fileData.baseName;
          showStatusMessage(`読み込み完了: ${displayTitle}`, 2500);
        } catch (err) {
          console.error('[DocumentContext] Read Error:', err);
          return;
        }
      }

      // ペインのアクティブパスを更新
      setActivePathByPane((prev) => ({
        ...prev,
        [targetPane]: path,
      }));
      setActivePane(targetPane);
    },
    [activePane, openDocuments, showStatusMessage]
  );

  // タブを閉じる（未保存なら自動保存、参照カウントゼロで完全アンロード、右ペインのみ残れば左昇格）
  const closeTab = useCallback(
    async (path: string, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const targetDoc = openDocuments.find((d) => d.path === path);

      // 1. 未保存なら確認ダイアログを出さずに自動保存
      if (targetDoc && targetDoc.isDirty) {
        clearAutoSaveTimer(path);
        await saveDocument(path);
      }

      // 2. 参照カウントの減算とクローズ処理
      setOpenDocuments((prev) => {
        const nextDocs: DocumentState[] = [];
        for (const doc of prev) {
          if (doc.path === path) {
            // 当該ペインの参照を外す
            const updatedViews = doc.views.filter((v) => v.viewId !== targetPane);
            if (updatedViews.length > 0) {
              // 他のViewからまだ参照されている場合は保持
              nextDocs.push({
                ...doc,
                views: updatedViews,
                leftViewMode: updatedViews.find((v) => v.viewId === 'editor.left')?.viewMode || 'none',
                rightViewMode: updatedViews.find((v) => v.viewId === 'editor.right')?.viewMode || 'none',
              });
            }
            // updatedViews.length === 0 の場合はアンロード（追加しない）
          } else {
            nextDocs.push(doc);
          }
        }

        // 3. 昇格チェック：左ペインのタブが0件になり、右ペインにのみタブがある場合、左ペインへ昇格
        const hasLeft = nextDocs.some((d) => d.views.some((v) => v.viewId === 'editor.left'));
        const hasRight = nextDocs.some((d) => d.views.some((v) => v.viewId === 'editor.right'));

        if (!hasLeft && hasRight) {
          // 右ペインの全タブを左ペインへ昇格
          const promotedDocs = nextDocs.map((doc) => {
            const promotedViews = doc.views.map((v) =>
              v.viewId === 'editor.right' ? { ...v, viewId: 'editor.left' } : v
            );
            return {
              ...doc,
              views: promotedViews,
              leftViewMode: (promotedViews.find((v) => v.viewId === 'editor.left')?.viewMode || 'none') as DocumentViewMode,
              rightViewMode: 'none' as DocumentViewMode,
            };
          });

          setActivePathByPane((prevPaths) => ({
            'editor.left': prevPaths['editor.right'],
            'editor.right': null,
          }));
          setIsSplit(false);
          setActivePane('editor.left');

          return promotedDocs;
        }

        // 4. 左ペインにタブがあり、右ペインのタブが0件になった場合：自動的に分割解除
        if (hasLeft && !hasRight) {
          setActivePathByPane((prevPaths) => ({
            ...prevPaths,
            'editor.right': null,
          }));
          setIsSplit(false);
          setActivePane('editor.left');
          return nextDocs;
        }

        // 左右両方とも0件になった場合
        if (!hasLeft && !hasRight) {
          setActivePathByPane({ 'editor.left': null, 'editor.right': null });
          setIsSplit(false);
          setActivePane('editor.left');
          return [];
        }

        return nextDocs;
      });

      // 当該ペインのアクティブパスの更新（次のタブへフォーカス移動）
      setActivePathByPane((prevPaths) => {
        if (prevPaths[targetPane] === path) {
          // 残っているタブから次のアクティブを選択
          const remainingTabs = openDocuments
            .filter((d) => d.path !== path && d.views.some((v) => v.viewId === targetPane));
          const nextActive = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].path : null;
          return {
            ...prevPaths,
            [targetPane]: nextActive,
          };
        }
        return prevPaths;
      });
    },
    [activePane, openDocuments, saveDocument, clearAutoSaveTimer]
  );

  // 全ペインから当該ドキュメントを閉じる（後方互換用）
  const closeDocument = useCallback(
    async (path: string) => {
      const doc = openDocuments.find((d) => d.path === path);
      if (!doc) return;
      // 登録されている全てのペインからクローズ
      const viewIds = doc.views.map((v) => v.viewId);
      for (const vid of viewIds) {
        await closeTab(path, vid as PaneId);
      }
    },
    [openDocuments, closeTab]
  );

  // 他のタブを閉じる
  const closeOtherTabs = useCallback(
    async (path: string, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const tabsToClose = openDocuments.filter(
        (d) => d.path !== path && d.views.some((v) => v.viewId === targetPane)
      );
      for (const t of tabsToClose) {
        await closeTab(t.path, targetPane);
      }
    },
    [activePane, openDocuments, closeTab]
  );

  // 指定したタブより右側のタブを閉じる
  const closeRightTabs = useCallback(
    async (path: string, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const paneTabs = openDocuments.filter((d) => d.views.some((v) => v.viewId === targetPane));
      const targetIndex = paneTabs.findIndex((d) => d.path === path);
      if (targetIndex !== -1 && targetIndex < paneTabs.length - 1) {
        const tabsToClose = paneTabs.slice(targetIndex + 1);
        for (const t of tabsToClose) {
          await closeTab(t.path, targetPane);
        }
      }
    },
    [activePane, openDocuments, closeTab]
  );

  // 指定したタブより左側のタブを閉じる
  const closeLeftTabs = useCallback(
    async (path: string, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const paneTabs = openDocuments.filter((d) => d.views.some((v) => v.viewId === targetPane));
      const targetIndex = paneTabs.findIndex((d) => d.path === path);
      if (targetIndex > 0) {
        const tabsToClose = paneTabs.slice(0, targetIndex);
        for (const t of tabsToClose) {
          await closeTab(t.path, targetPane);
        }
      }
    },
    [activePane, openDocuments, closeTab]
  );

  // ペインの全タブを閉じる
  const closeAllTabs = useCallback(
    async (paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const tabsToClose = openDocuments.filter((d) => d.views.some((v) => v.viewId === targetPane));
      for (const t of tabsToClose) {
        await closeTab(t.path, targetPane);
      }
    },
    [activePane, openDocuments, closeTab]
  );

  // ペインを閉じる
  const closePane = useCallback(
    async (paneId: PaneId) => {
      await closeAllTabs(paneId);
      if (paneId === 'editor.right') {
        setIsSplit(false);
        setActivePane('editor.left');
      }
    },
    [closeAllTabs]
  );

  // タブの切り替え（切り替え元の未保存ドキュメントを即時自動保存）
  const switchTab = useCallback((path: string, paneId?: PaneId) => {
    const targetPane = paneId || activePane;
    const currentPath = activePathByPane[targetPane];
    if (currentPath && currentPath !== path) {
      const currentDoc = openDocumentsRef.current.find((d) => d.path === currentPath);
      if (currentDoc?.isDirty) {
        clearAutoSaveTimer(currentPath);
        saveDocument(currentPath);
      }
    }

    setActivePathByPane((prev) => ({
      ...prev,
      [targetPane]: path,
    }));
    setActivePane(targetPane);
  }, [activePane, activePathByPane, clearAutoSaveTimer, saveDocument]);

  const setActivePath = useCallback((path: string) => {
    switchTab(path, activePane);
  }, [switchTab, activePane]);

  // ペインのアクティブ切り替え（移動元未保存ドキュメントの即時保存）
  const handleSetActivePane = useCallback((paneId: PaneId) => {
    if (paneId !== activePane) {
      const currentPath = activePathByPane[activePane];
      if (currentPath) {
        const currentDoc = openDocumentsRef.current.find((d) => d.path === currentPath);
        if (currentDoc?.isDirty) {
          clearAutoSaveTimer(currentPath);
          saveDocument(currentPath);
        }
      }
    }
    setActivePane(paneId);
  }, [activePane, activePathByPane, clearAutoSaveTimer, saveDocument]);

  // IME変換状態の制御
  const setCompositionState = useCallback((isComposing: boolean) => {
    isComposingRef.current = isComposing;
    if (!isComposing) {
      // 変換確定時、アクティブドキュメントが未保存であれば3秒デバウンスタイマーを開始
      const activeP = activePathRef.current;
      if (activeP) {
        const doc = openDocumentsRef.current.find((d) => d.path === activeP);
        if (doc?.isDirty) {
          clearAutoSaveTimer(activeP);
          autoSaveTimersRef.current[activeP] = setTimeout(() => {
            saveDocument(activeP);
            delete autoSaveTimersRef.current[activeP];
          }, 3000);
        }
      }
    }
  }, [clearAutoSaveTimer, saveDocument]);

  // 本文内容を更新（単一実体のため左右両ペインで即同期、デバウンス自動保存）
  const updateContent = useCallback((path: string, content: string) => {
    // 【重要】openDocumentsRef.current を同期的に即座に更新！
    // React の非同期 state レンダリングを待たずに即時反映することで、
    // Backspace直後の Ctrl+S や自動保存に古いクロージャのテキスト（ゴミ）が保存されるのを完全に防止する
    openDocumentsRef.current = openDocumentsRef.current.map((doc) => {
      if (doc.path === path) {
        return {
          ...doc,
          content,
          isDirty: true,
        };
      }
      return doc;
    });

    setOpenDocuments((prev) =>
      prev.map((doc) => {
        if (doc.path === path) {
          return {
            ...doc,
            content,
            isDirty: true,
          };
        }
        return doc;
      })
    );

    // デバウンス自動保存（IME変換中でない場合に3秒後保存）
    clearAutoSaveTimer(path);
    if (!isComposingRef.current) {
      autoSaveTimersRef.current[path] = setTimeout(() => {
        saveDocument(path);
        delete autoSaveTimersRef.current[path];
      }, 3000);
    }
  }, [clearAutoSaveTimer, saveDocument]);

  // メタデータを更新
  const updateMetadata = useCallback((path: string, metadata: Record<string, any>) => {
    setOpenDocuments((prev) =>
      prev.map((doc) => {
        if (doc.path === path) {
          return {
            ...doc,
            metadata,
            isDirty: true,
          };
        }
        return doc;
      })
    );
  }, []);

  // 同一ペイン内でのビューモード切り替え (edit <-> preview など)
  const changeViewMode = useCallback(
    (path: string, viewMode: DocumentViewMode, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      setOpenDocuments((prev) =>
        prev.map((doc) => {
          if (doc.path === path) {
            const nextViews = doc.views.map((v) =>
              v.viewId === targetPane ? { ...v, viewMode } : v
            );
            return {
              ...doc,
              views: nextViews,
              leftViewMode: nextViews.find((v) => v.viewId === 'editor.left')?.viewMode || 'none',
              rightViewMode: nextViews.find((v) => v.viewId === 'editor.right')?.viewMode || 'none',
            };
          }
          return doc;
        })
      );
    },
    [activePane]
  );

  // プレビューを開く
  const openPreview = useCallback(
    (path: string, mode: 'preview' | 'reader' = 'preview', targetPane?: PaneId) => {
      changeViewMode(path, mode, targetPane || activePane);
    },
    [changeViewMode, activePane]
  );

  // 反対側のペインIDを取得するヘルパー
  const getOppositePane = useCallback((paneId: PaneId): PaneId => {
    return paneId === 'editor.left' ? 'editor.right' : 'editor.left';
  }, []);

  // 別サイドのビューに、プレビュー状態で開く（すでに存在する場合はアクティブ化）
  const openPreviewInOtherPane = useCallback(
    (path?: string, fromPane?: PaneId) => {
      const sourcePane = fromPane || activePane;
      const targetPane = getOppositePane(sourcePane);
      const targetPath = path || activePathByPane[sourcePane];
      if (!targetPath) return;

      const doc = openDocuments.find((d) => d.path === targetPath);
      const previewMode = doc?.documentType === 'novel' ? 'reader' : 'preview';

      setIsSplit(true);

      // 反対ペインに既に開かれているか確認
      const existingView = doc?.views.find((v) => v.viewId === targetPane);
      if (existingView) {
        // すでに開かれている場合：プレビュー系でなければプレビューに切り替え、アクティブ化
        if (existingView.viewMode !== previewMode) {
          changeViewMode(targetPath, previewMode, targetPane);
        }
        setActivePathByPane((prev) => ({ ...prev, [targetPane]: targetPath }));
        setActivePane(targetPane);
      } else {
        // まだ開かれていない場合は新規追加してアクティブ化
        openDocument(targetPath, { paneId: targetPane, viewMode: previewMode });
      }
    },
    [activePane, activePathByPane, getOppositePane, openDocuments, changeViewMode, openDocument]
  );

  // 同じ状態のまま、別サイドに表示する（すでに存在する場合はアクティブ化）
  const splitToOtherPane = useCallback(
    (path?: string, fromPane?: PaneId) => {
      const sourcePane = fromPane || activePane;
      const targetPane = getOppositePane(sourcePane);
      const targetPath = path || activePathByPane[sourcePane];
      if (!targetPath) return;

      const doc = openDocuments.find((d) => d.path === targetPath);
      const sourceView = doc?.views.find((v) => v.viewId === sourcePane);
      const targetMode = sourceView?.viewMode || 'editor';

      setIsSplit(true);

      // 反対ペインに既に開かれているか確認
      const existingView = doc?.views.find((v) => v.viewId === targetPane);
      if (existingView) {
        // すでに開かれている場合は、そのドキュメントをアクティブ化
        setActivePathByPane((prev) => ({ ...prev, [targetPane]: targetPath }));
        setActivePane(targetPane);
      } else {
        // 同じ表示モードのまま反対ペインに開き、アクティブ化
        openDocument(targetPath, { paneId: targetPane, viewMode: targetMode });
      }
    },
    [activePane, activePathByPane, getOppositePane, openDocuments, openDocument]
  );

  // 指定したタブを反対側のペインへ移動する（元のペインからは閉じる）
  const moveToOtherPane = useCallback(
    async (path: string, fromPane?: PaneId) => {
      const sourcePane = fromPane || activePane;
      const targetPane = getOppositePane(sourcePane);
      if (!path) return;

      const doc = openDocuments.find((d) => d.path === path);
      const sourceView = doc?.views.find((v) => v.viewId === sourcePane);
      const targetMode = sourceView?.viewMode || 'editor';

      setIsSplit(true);

      // 反対ペインに開く（既存ならアクティブ化）
      await openDocument(path, { paneId: targetPane, viewMode: targetMode });

      // 元のペインからタブを閉じる
      await closeTab(path, sourcePane);

      // 移動先のペインをアクティブにする
      setActivePane(targetPane);
    },
    [activePane, getOppositePane, openDocuments, openDocument, closeTab]
  );

  // 後方互換用：ペイン閉鎖は行わず、安全に別サイドプレビューを実行
  const openPreviewInSplit = useCallback(
    (path?: string) => {
      openPreviewInOtherPane(path, 'editor.left');
    },
    [openPreviewInOtherPane]
  );

  const toggleSplitPreview = useCallback(
    (path?: string) => {
      openPreviewInOtherPane(path, activePane);
    },
    [openPreviewInOtherPane, activePane]
  );

  // スプリット開閉トグル
  const toggleSplit = useCallback(() => {
    if (isSplit) {
      closePane('editor.right');
    } else {
      setIsSplit(true);
      // 右ペインが空なら、現在のアクティブドキュメントをプレビューで開く
      if (activePath && !activePathByPane['editor.right']) {
        openPreviewInOtherPane(activePath, 'editor.left');
      }
    }
  }, [isSplit, closePane, activePath, activePathByPane, openPreviewInOtherPane]);

  // ウィンドウフォーカス復帰時の3段階オンデマンド検証パイプライン
  const lastFocusCheckRef = useRef<number>(0);

  const checkExternalChanges = useCallback(async () => {
    const now = Date.now();
    if (now - lastFocusCheckRef.current < 500) return;
    lastFocusCheckRef.current = now;

    const docs = openDocumentsRef.current;
    if (docs.length === 0) {
      window.dispatchEvent(new CustomEvent('novelaide:project-refresh-needed'));
      return;
    }

    const activeP = activePathRef.current;

    const checkDoc = async (doc: DocumentState, isActive: boolean) => {
      // 自己保存処理中の場合は外部変更チェックをスキップ（自己エコー遮断）
      if (savingPathsRef.current.has(doc.path)) {
        console.log('[DocumentContext] Focus Check: skipped (self-saving in progress):', doc.baseName);
        return;
      }

      try {
        const stat = await fileService.getDocumentStat(doc.path);
        const diff = doc.mtime ? stat.mtimeMs - doc.mtime : 0;

        console.log('[DocumentContext] Focus Check:', doc.baseName, {
          memMtime: doc.mtime,
          diskMtime: stat.mtimeMs,
          diff,
          isDirty: doc.isDirty,
        });

        if (!stat.exists) {
          if (!doc.isDirty) {
            showToast({
              type: 'warning',
              message: `${doc.baseName} は外部で削除されたため閉じられました`,
              duration: 4000,
            });
            await closeDocument(doc.path);
          } else {
            const bannerId = `external-deleted-${doc.path}`;
            showBanner({
              id: bannerId,
              type: 'warning',
              message: `${doc.baseName} は外部で削除されましたが、未保存の編集内容があります。`,
              actions: [
                {
                  label: '破棄して閉じる',
                  onClick: () => {
                    dismissBanner(bannerId);
                    closeDocument(doc.path);
                  },
                },
                {
                  label: '再保存する',
                  primary: true,
                  onClick: async () => {
                    dismissBanner(bannerId);
                    await saveDocument(doc.path);
                  },
                },
              ],
            });
          }
          return;
        }

        // mtime 比較による外部更新検知（Windows NTFS等の微小遅延を考慮し 100ms 以上の差がある場合のみ判定）
        if (doc.mtime && diff > 100) {
          if (!doc.isDirty) {
            // 未編集（isDirty: false）: 自動再読み込み
            console.log('[DocumentContext] External Reload Start:', doc.path, { oldMtime: doc.mtime, newMtime: stat.mtimeMs, diff });
            const fresh = await fileService.readFile(doc.path);

            // openDocumentsRef.current を同期的に即座に更新
            openDocumentsRef.current = openDocumentsRef.current.map((d) =>
              d.path === doc.path
                ? {
                    ...d,
                    content: fresh.content,
                    metadata: fresh.metadata || {},
                    mtime: fresh.mtimeMs,
                    isDirty: false,
                  }
                : d
            );

            setOpenDocuments((prev) =>
              prev.map((d) =>
                d.path === doc.path
                  ? {
                      ...d,
                      content: fresh.content,
                      metadata: fresh.metadata || {},
                      mtime: fresh.mtimeMs,
                      isDirty: false,
                    }
                  : d
              )
            );

            // Monaco Editor 等のビューへ外部変更による再読み込みを通知
            window.dispatchEvent(
              new CustomEvent('novelaide:document-reloaded', {
                detail: { path: doc.path, content: fresh.content },
              })
            );

            console.log('[DocumentContext] External Reload Done:', doc.path);
            const displayTitle = doc.fileTitle || doc.baseName;
            showStatusMessage(`外部変更を再読み込み: ${displayTitle}`, 3000);

            if (isActive) {
              showToast({
                type: 'info',
                message: `${doc.baseName} を外部の変更に合わせて再読み込みしました`,
                duration: 3500,
              });
            }
          } else {
            // 編集中（isDirty: true）: メモリ内容保護、L3エディタバナーで選択提示
            console.warn('[DocumentContext] External Conflict Detected (doc isDirty):', doc.baseName, { diff });
            const bannerId = `external-conflict-${doc.path}`;
            showBanner({
              id: bannerId,
              type: 'warning',
              message: `${doc.baseName} は外部で変更されました。現在の編集内容を保持しますか、それとも最新を取り込みますか？`,
              actions: [
                {
                  label: '最新を取り込む',
                  onClick: async () => {
                    dismissBanner(bannerId);
                    const fresh = await fileService.readFile(doc.path);

                    openDocumentsRef.current = openDocumentsRef.current.map((d) =>
                      d.path === doc.path
                        ? {
                            ...d,
                            content: fresh.content,
                            metadata: fresh.metadata || {},
                            mtime: fresh.mtimeMs,
                            isDirty: false,
                          }
                        : d
                    );

                    setOpenDocuments((prev) =>
                      prev.map((d) =>
                        d.path === doc.path
                          ? {
                              ...d,
                              content: fresh.content,
                              metadata: fresh.metadata || {},
                              mtime: fresh.mtimeMs,
                              isDirty: false,
                            }
                          : d
                      )
                    );

                    window.dispatchEvent(
                      new CustomEvent('novelaide:document-reloaded', {
                        detail: { path: doc.path, content: fresh.content },
                      })
                    );

                    showStatusMessage(`外部変更を反映: ${doc.fileTitle || doc.baseName}`, 3000);
                    showToast({
                      type: 'success',
                      message: `${doc.baseName} を最新の内容に更新しました`,
                      duration: 3500,
                    });
                  },
                },
                {
                  label: '現在の編集を保持',
                  primary: true,
                  onClick: () => {
                    dismissBanner(bannerId);
                    openDocumentsRef.current = openDocumentsRef.current.map((d) =>
                      d.path === doc.path ? { ...d, mtime: stat.mtimeMs } : d
                    );
                    setOpenDocuments((prev) =>
                      prev.map((d) =>
                        d.path === doc.path ? { ...d, mtime: stat.mtimeMs } : d
                      )
                    );
                  },
                },
              ],
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to check external changes for ${doc.path}:`, err);
      }
    };

    // 第1優先: アクティブ表示中タブの検証
    const activeDoc = docs.find((d) => d.path === activeP);
    if (activeDoc) {
      await checkDoc(activeDoc, true);
    }

    // 第2優先: 非アクティブタブの順次検証
    const backgroundDocs = docs.filter((d) => d.path !== activeP);
    for (const bgDoc of backgroundDocs) {
      await checkDoc(bgDoc, false);
    }

    // 第3優先: プロジェクト全体のディレクトリ走査通知
    window.dispatchEvent(new CustomEvent('novelaide:project-refresh-needed'));
  }, [closeDocument, showBanner, showToast, dismissBanner, saveDocument, showStatusMessage]);

  // ファイルまたはフォルダのリネーム・移動に伴うタブ状態のインプレース追従更新
  const updateDocumentPath = useCallback((oldPath: string, newPath: string) => {
    const normOld = fileService.normalizePath(oldPath);

    // 1. openDocuments 内のパス、タイトル、ファイル名をインプレース更新
    setOpenDocuments((prev) => {
      let hasChanges = false;
      const nextDocs = prev.map((doc) => {
        // パターンA: ファイル自身の完全一致（大文字小文字・スラッシュを吸収）
        if (fileService.isSamePath(doc.path, oldPath)) {
          hasChanges = true;
          const newBaseName = fileService.basename(newPath);
          const newExt = fileService.extname(newPath);
          const newTitle = fileService.stem(newPath);
          const newDir = fileService.dirname(newPath);
          return {
            ...doc,
            path: newPath,
            absolutePath: newPath,
            baseName: newBaseName,
            fileTitle: newTitle,
            extension: newExt,
            parentDir: newDir,
          };
        }

        // パターンB: フォルダ配下のドキュメント（親フォルダがリネーム/移動された場合）
        if (fileService.isSubPath(doc.path, oldPath)) {
          hasChanges = true;
          const oldPrefixLen = normOld.length;
          const subRelative = fileService.normalizePath(doc.path).substring(oldPrefixLen).replace(/^\/+/, '');
          const updatedPath = fileService.joinPath(newPath, subRelative);
          const newBaseName = fileService.basename(updatedPath);
          const newExt = fileService.extname(updatedPath);
          const newTitle = fileService.stem(updatedPath);
          const newDir = fileService.dirname(updatedPath);
          return {
            ...doc,
            path: updatedPath,
            absolutePath: updatedPath,
            baseName: newBaseName,
            fileTitle: newTitle,
            extension: newExt,
            parentDir: newDir,
          };
        }

        return doc;
      });

      if (!hasChanges) {
        return prev;
      }
      openDocumentsRef.current = nextDocs;
      return nextDocs;
    });

    // 2. activePathByPane のアクティブパス追従
    setActivePathByPane((prev) => {
      let hasChanges = false;
      const updated = { ...prev };
      (Object.keys(updated) as PaneId[]).forEach((paneId) => {
        const cur = updated[paneId];
        if (!cur) return;
        if (fileService.isSamePath(cur, oldPath)) {
          updated[paneId] = newPath;
          hasChanges = true;
        } else if (fileService.isSubPath(cur, oldPath)) {
          const oldPrefixLen = normOld.length;
          const subRelative = fileService.normalizePath(cur).substring(oldPrefixLen).replace(/^\/+/, '');
          updated[paneId] = fileService.joinPath(newPath, subRelative);
          hasChanges = true;
        }
      });
      return hasChanges ? updated : prev;
    });
  }, []);

  // ドキュメントのリネーム（ファイル名変更）
  const renameDocument = useCallback(
    async (oldPath: string, newTitle: string): Promise<boolean> => {
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle) {
        showToast({
          type: 'warning',
          message: 'ファイル名を入力してください',
        });
        return false;
      }

      // Windows/Unix 禁止文字チェック: \ / : * ? " < > |
      if (/[\\/:*?"<>|]/.test(trimmedTitle)) {
        showToast({
          type: 'warning',
          message: 'ファイル名に使用できない文字が含まれています (\\ / : * ? " < > |)',
        });
        return false;
      }

      // パスから親ディレクトリと拡張子を分解
      const separator = oldPath.includes('\\') ? '\\' : '/';
      const lastSlashIndex = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'));
      const parentDir = lastSlashIndex !== -1 ? oldPath.substring(0, lastSlashIndex) : '';
      const currentFileName = lastSlashIndex !== -1 ? oldPath.substring(lastSlashIndex + 1) : oldPath;

      const dotIndex = currentFileName.lastIndexOf('.');
      const ext = dotIndex !== -1 ? currentFileName.substring(dotIndex) : '';
      const currentTitle = dotIndex !== -1 ? currentFileName.substring(0, dotIndex) : currentFileName;

      if (trimmedTitle === currentTitle) {
        return false; // 変更なし
      }

      const newFileName = `${trimmedTitle}${ext}`;
      const newPath = parentDir ? `${parentDir}${separator}${newFileName}` : newFileName;

      // 未保存の編集内容があれば先に保存
      const doc = openDocuments.find((d) => fileService.isSamePath(d.path, oldPath));
      if (doc && doc.isDirty) {
        await saveDocument(oldPath);
      }

      try {
        await fileService.rename(oldPath, newPath);

        // openDocuments および activePathByPane をアトミックにインプレース更新
        updateDocumentPath(oldPath, newPath);

        showToast({
          type: 'info',
          message: `「${newFileName}」に名前を変更しました`,
        });
        window.dispatchEvent(new CustomEvent('novelaide:project-refresh-needed'));
        return true;
      } catch (err) {
        console.error('Failed to rename document:', err);
        showToast({
          type: 'error',
          message: `名前の変更に失敗しました: ${err}`,
        });
        return false;
      }
    },
    [openDocuments, saveDocument, showToast, updateDocumentPath]
  );

  useEffect(() => {
    const handleFocus = () => {
      checkExternalChanges();
    };

    const handleBlur = () => {
      // ウィンドウフォーカス喪失時（他アプリ切り替え等）に未保存ドキュメントを即時保存
      const docs = openDocumentsRef.current;
      for (const doc of docs) {
        if (doc.isDirty) {
          clearAutoSaveTimer(doc.path);
          saveDocument(doc.path);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [checkExternalChanges, clearAutoSaveTimer, saveDocument]);

  return (
    <DocumentContext.Provider
      value={{
        openDocuments,
        activePane,
        activePathByPane,
        isSplit,
        splitRatio,
        activePath,
        activeDocument,
        activeLeftItem,
        activeRightItem,
        isSplitActive,
        getTabsForPane,
        getActiveDocumentForPane,
        openDocument,
        closeTab,
        closeDocument,
        closeOtherTabs,
        closeRightTabs,
        closeLeftTabs,
        closeAllTabs,
        switchTab,
        setActivePane: handleSetActivePane,
        setActivePath,
        changeViewMode,
        openPreview,
        openPreviewInOtherPane,
        splitToOtherPane,
        moveToOtherPane,
        openPreviewInSplit,
        toggleSplitPreview,
        toggleSplit,
        setSplitRatio,
        closePane,
        updateContent,
        updateMetadata,
        saveDocument,
        renameDocument,
        updateDocumentPath,
        setCompositionState,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocument = (): DocumentContextType => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }
  return context;
};
