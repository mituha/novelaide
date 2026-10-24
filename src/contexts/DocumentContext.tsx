import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { fileService } from '../services/fileService';
import { NovelaidDocumentType } from 'tauri-plugin-novelaid-fs-api';

export interface DocumentState {
  path: string;
  baseName: string;
  fileTitle: string;
  content: string;
  metadata: Record<string, any>;
  documentType: NovelaidDocumentType;
  isDirty: boolean;
}

interface DocumentContextType {
  openDocuments: DocumentState[];
  activePath: string | null;
  activeDocument: DocumentState | null;
  openDocument: (path: string) => Promise<void>;
  closeDocument: (path: string) => void;
  setActivePath: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveDocument: (path?: string) => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openDocuments, setOpenDocuments] = useState<DocumentState[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // 現在アクティブなドキュメントを取得
  const activeDocument = useMemo(() => {
    return openDocuments.find((doc) => doc.path === activePath) || null;
  }, [openDocuments, activePath]);

  // ファイルを開く
  const openDocument = useCallback(async (path: string) => {
    // すでに開いている場合はアクティブにするのみ
    const existing = openDocuments.find((doc) => doc.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }

    try {
      const fileData = await fileService.readFile(path);
      const newDoc: DocumentState = {
        path: fileData.path,
        baseName: fileData.baseName,
        fileTitle: fileData.fileTitle,
        content: fileData.content,
        metadata: fileData.metadata || {},
        documentType: fileData.documentType,
        isDirty: false,
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
        // 閉じたファイルがアクティブだった場合、別のタブをアクティブにする
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

  return (
    <DocumentContext.Provider
      value={{
        openDocuments,
        activePath,
        activeDocument,
        openDocument,
        closeDocument,
        setActivePath,
        updateContent,
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
