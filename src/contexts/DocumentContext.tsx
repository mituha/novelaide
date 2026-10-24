import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { fileService } from '../services/fileService';
import { DocumentState, DocumentViewMode } from '../types/document';
import { getInitialViewMode } from '../utils/documentSupport';

export type { DocumentState };

interface DocumentContextType {
  openDocuments: DocumentState[];
  activePath: string | null;
  activeDocument: DocumentState | null;
  isSplitActive: boolean;
  openDocument: (path: string) => Promise<void>;
  closeDocument: (path: string) => void;
  setActivePath: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveDocument: (path?: string) => Promise<void>;
  changeViewMode: (path: string, viewMode: DocumentViewMode, side?: 'left' | 'right') => void;
  openPreview: (path: string, mode?: 'preview' | 'reader') => void;
  closeRightPane: (path: string) => void;
  toggleSplitPreview: (path?: string) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openDocuments, setOpenDocuments] = useState<DocumentState[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // 現在アクティブなドキュメントを取得
  const activeDocument = useMemo(() => {
    return openDocuments.find((doc) => doc.path === activePath) || null;
  }, [openDocuments, activePath]);

  // スプリット（右ペイン）が表示中かどうか
  const isSplitActive = useMemo(() => {
    return !!activeDocument && activeDocument.rightViewMode !== 'none';
  }, [activeDocument]);

  // ファイルを開く
  const openDocument = useCallback(async (path: string) => {
    const existing = openDocuments.find((doc) => doc.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }

    try {
      const fileData = await fileService.readFile(path);
      const initialMode = getInitialViewMode(fileData.documentType);

      const newDoc: DocumentState = {
        path: fileData.path,
        baseName: fileData.baseName,
        fileTitle: fileData.fileTitle,
        content: fileData.content,
        metadata: fileData.metadata || {},
        documentType: fileData.documentType,
        isDirty: false,
        leftViewMode: initialMode,
        rightViewMode: 'none',
      };

      setOpenDocuments((prev) => [...prev, newDoc]);
      setActivePath(path);
    } catch (err) {
      console.error('Failed to open document:', err);
    }
  }, [openDocuments]);

  // ドキュメントを閉じる
  const closeDocument = useCallback((path: string) => {
    setOpenDocuments((prev) => {
      const filtered = prev.filter((doc) => doc.path !== path);
      if (activePath === path) {
        const nextActive = filtered.length > 0 ? filtered[filtered.length - 1].path : null;
        setActivePath(nextActive);
      }
      return filtered;
    });
  }, [activePath]);

  // 本文内容を更新（編集時）
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

  // ドキュメントを保存（Ctrl + S）
  const saveDocument = useCallback(async (path?: string) => {
    const targetPath = path || activePath;
    if (!targetPath) return;

    const docToSave = openDocuments.find((doc) => doc.path === targetPath);
    if (!docToSave) return;

    try {
      await fileService.writeFile(docToSave.path, docToSave.content, docToSave.metadata);
      setOpenDocuments((prev) =>
        prev.map((doc) => {
          if (doc.path === targetPath) {
            return {
              ...doc,
              isDirty: false,
            };
          }
          return doc;
        })
      );
    } catch (err) {
      console.error('Failed to save document:', err);
    }
  }, [activePath, openDocuments]);

  // ビューモードの変更
  const changeViewMode = useCallback(
    (path: string, viewMode: DocumentViewMode, side: 'left' | 'right' = 'left') => {
      setOpenDocuments((prev) =>
        prev.map((doc) => {
          if (doc.path === path) {
            return {
              ...doc,
              [side === 'left' ? 'leftViewMode' : 'rightViewMode']: viewMode,
            };
          }
          return doc;
        })
      );
    },
    []
  );

  // 右ペインでプレビューを開く（スプリット展開）
  const openPreview = useCallback(
    (path: string, mode: 'preview' | 'reader' = 'preview') => {
      changeViewMode(path, mode, 'right');
    },
    [changeViewMode]
  );

  // 右ペインを閉じる（スプリット解除）
  const closeRightPane = useCallback(
    (path: string) => {
      changeViewMode(path, 'none', 'right');
    },
    [changeViewMode]
  );

  // スプリットプレビューのトグル
  const toggleSplitPreview = useCallback(
    (path?: string) => {
      const targetPath = path || activePath;
      if (!targetPath) return;

      const doc = openDocuments.find((d) => d.path === targetPath);
      if (!doc) return;

      if (doc.rightViewMode === 'none') {
        // 小説なら縦書きリーダーまたはプレビュー、Markdownならプレビュー
        const defaultMode = doc.documentType === 'novel' ? 'reader' : 'preview';
        changeViewMode(targetPath, defaultMode, 'right');
      } else {
        changeViewMode(targetPath, 'none', 'right');
      }
    },
    [activePath, openDocuments, changeViewMode]
  );

  return (
    <DocumentContext.Provider
      value={{
        openDocuments,
        activePath,
        activeDocument,
        isSplitActive,
        openDocument,
        closeDocument,
        setActivePath,
        updateContent,
        saveDocument,
        changeViewMode,
        openPreview,
        closeRightPane,
        toggleSplitPreview,
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
