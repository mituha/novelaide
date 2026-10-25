import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { fileService } from '../services/fileService';
import { DocumentState, DocumentViewMode, PaneId, DocumentViewRef } from '../types/document';
import { getInitialViewMode } from '../utils/documentSupport';

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
  closeAllTabs: (paneId?: PaneId) => Promise<void>;
  switchTab: (path: string, paneId?: PaneId) => void;
  setActivePane: (paneId: PaneId) => void;
  setActivePath: (path: string) => void;

  // ビューモード & プレビュー操作
  changeViewMode: (path: string, viewMode: DocumentViewMode, paneId?: PaneId) => void;
  openPreview: (path: string, mode?: 'preview' | 'reader', targetPane?: PaneId) => void;
  openPreviewInSplit: (path?: string) => void;
  toggleSplitPreview: (path?: string) => void;
  toggleSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  closePane: (paneId: PaneId) => Promise<void>;

  // ドキュメント実体編集・保存
  updateContent: (path: string, content: string) => void;
  updateMetadata: (path: string, metadata: Record<string, any>) => void;
  saveDocument: (path?: string) => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openDocuments, setOpenDocuments] = useState<DocumentState[]>([]);
  const [activePane, setActivePane] = useState<PaneId>('editor.left');
  const [activePathByPane, setActivePathByPane] = useState<Record<PaneId, string | null>>({
    'editor.left': null,
    'editor.right': null,
  });
  const [isSplit, setIsSplit] = useState<boolean>(false);
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

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
    async (path?: string) => {
      const targetPath = path || activePath;
      if (!targetPath) return;

      const docToSave = openDocuments.find((doc) => doc.path === targetPath);
      if (!docToSave) return;

      try {
        await fileService.writeFile(docToSave.path, docToSave.content, docToSave.metadata);
        setOpenDocuments((prev) =>
          prev.map((doc) => {
            if (doc.path === targetPath) {
              return { ...doc, isDirty: false };
            }
            return doc;
          })
        );
      } catch (err) {
        console.error('Failed to save document:', err);
      }
    },
    [activePath, openDocuments]
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
            baseName: fileData.baseName,
            fileTitle: fileData.fileTitle,
            content: fileData.content,
            metadata: fileData.metadata || {},
            documentType: fileData.documentType,
            isDirty: false,
            views: [{ viewId: targetPane, viewMode: mode }],
            leftViewMode: targetPane === 'editor.left' ? mode : 'none',
            rightViewMode: targetPane === 'editor.right' ? mode : 'none',
          };

          setOpenDocuments((prev) => [...prev, newDoc]);
        } catch (err) {
          console.error('Failed to open document:', err);
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
    [activePane, openDocuments]
  );

  // タブを閉じる（未保存なら自動保存、参照カウントゼロで完全アンロード、右ペインのみ残れば左昇格）
  const closeTab = useCallback(
    async (path: string, paneId?: PaneId) => {
      const targetPane = paneId || activePane;
      const targetDoc = openDocuments.find((d) => d.path === path);

      // 1. 未保存なら確認ダイアログを出さずに自動保存
      if (targetDoc && targetDoc.isDirty) {
        try {
          await fileService.writeFile(targetDoc.path, targetDoc.content, targetDoc.metadata);
        } catch (e) {
          console.error('Failed to auto-save document on close:', e);
        }
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
    [activePane, openDocuments]
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

  // タブの切り替え
  const switchTab = useCallback((path: string, paneId?: PaneId) => {
    const targetPane = paneId || activePane;
    setActivePathByPane((prev) => ({
      ...prev,
      [targetPane]: path,
    }));
    setActivePane(targetPane);
  }, [activePane]);

  const setActivePath = useCallback((path: string) => {
    switchTab(path, activePane);
  }, [switchTab, activePane]);

  // 本文内容を更新（単一実体のため左右両ペインで即同期）
  const updateContent = useCallback((path: string, content: string) => {
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
  }, []);

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

  // 別ペイン（右ペイン）へのプレビュー展開
  const openPreviewInSplit = useCallback(
    (path?: string) => {
      const targetPath = path || activePath;
      if (!targetPath) return;

      const doc = openDocuments.find((d) => d.path === targetPath);
      const defaultMode = doc?.documentType === 'novel' ? 'reader' : 'preview';

      setIsSplit(true);
      openDocument(targetPath, { paneId: 'editor.right', viewMode: defaultMode });
    },
    [activePath, openDocuments, openDocument]
  );

  // スプリットプレビューのトグル
  const toggleSplitPreview = useCallback(
    (path?: string) => {
      if (isSplit) {
        // スプリットを閉じる（右ペインを一括アンロード）
        closePane('editor.right');
      } else {
        openPreviewInSplit(path);
      }
    },
    [isSplit, closePane, openPreviewInSplit]
  );

  // スプリット開閉トグル
  const toggleSplit = useCallback(() => {
    if (isSplit) {
      closePane('editor.right');
    } else {
      setIsSplit(true);
      // 右ペインが空なら、現在のアクティブドキュメントをプレビューで開く
      if (activePath && !activePathByPane['editor.right']) {
        openPreviewInSplit(activePath);
      }
    }
  }, [isSplit, closePane, activePath, activePathByPane, openPreviewInSplit]);

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
        closeAllTabs,
        switchTab,
        setActivePane,
        setActivePath,
        changeViewMode,
        openPreview,
        openPreviewInSplit,
        toggleSplitPreview,
        toggleSplit,
        setSplitRatio,
        closePane,
        updateContent,
        updateMetadata,
        saveDocument,
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
