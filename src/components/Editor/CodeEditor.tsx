import React, { useCallback, useRef, useEffect } from 'react';
import MonacoEditor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { useTheme } from '../../contexts/ThemeContext';
import { useDocument } from '../../contexts/DocumentContext';
import { useSettings } from '../../contexts/SettingsContext';
import { EditorSupport } from './EditorSupport';
import { DocumentViewProps } from '../../types/viewPlugin';
import './CodeEditor.css';

interface CodeEditorProps extends Partial<DocumentViewProps> {
  value?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  content,
  path = '',
  language,
  documentType = 'novel',
  isReadOnly = false,
  onChange,
  onChangeContent,
}) => {
  const { effectiveTheme } = useTheme();
  const { saveDocument } = useDocument();
  const { settings } = useSettings();
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const saveDocumentRef = useRef(saveDocument);

  // 表示するテキスト（content または value）
  const textValue = content !== undefined ? content : (value ?? '');

  // 言語の解決
  const effectiveLanguage = language || (documentType === 'markdown' ? 'markdown' : 'novel');

  useEffect(() => {
    saveDocumentRef.current = saveDocument;
  }, [saveDocument]);

  // デコレーション（全角スペース等）の更新
  const updateDecorations = useCallback((editor: any) => {
    const model = editor?.getModel();
    if (!model) return;

    const newDecorations = EditorSupport.getEditorDecorations(model);
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, []);

  const handleBeforeMount: BeforeMount = (monaco) => {
    EditorSupport.registerLanguages(monaco);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // 初回デコレーション
    updateDecorations(editor);

    // テキスト変更時のデコレーション更新
    editor.onDidChangeModelContent(() => {
      updateDecorations(editor);
    });

    // ショートカットキー: Ctrl+S (Cmd+S) で保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveDocumentRef.current();
    });

    // 選択テキスト変更イベント
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && !selection.isEmpty() && model) {
        const text = model.getValueInRange(selection);
        window.dispatchEvent(
          new CustomEvent('editor-selection-change', {
            detail: { text, path },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent('editor-selection-change', {
            detail: { text: '', path },
          })
        );
      }
    });
  };

  // テキスト変更時のハンドラ
  const handleChange = (val: string | undefined) => {
    if (onChange) {
      onChange(val);
    }
    if (onChangeContent && val !== undefined) {
      onChangeContent(val);
    }
  };

  // テーマの解決（ダーク・ライト・セピア）
  const getTheme = () => {
    if (effectiveTheme === 'sepia') return 'novel-sepia';
    if (effectiveTheme === 'light') return 'novel-light';
    return 'novel-dark';
  };

  return (
    <div className="code-editor-container">
      <MonacoEditor
        key={path}
        height="100%"
        language={effectiveLanguage}
        value={textValue}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        theme={getTheme()}
        options={{
          readOnly: isReadOnly,
          wordWrap: settings.editorWordWrap || 'on',
          minimap: { enabled: !!settings.editorMinimap },
          fontSize: settings.editorFontSize ?? 16,
          lineHeight: Math.round((settings.editorFontSize ?? 16) * (settings.editorLineHeight ?? 1.8)),
          fontFamily: settings.editorFontFamily || "'Yu Gothic', 'Meiryo', 'Hiragino Mincho ProN', sans-serif",
          lineNumbers: settings.editorLineNumbers || 'on',
          renderWhitespace: 'all',
          renderControlCharacters: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorSurroundingLines: 5,
          automaticLayout: true,
          padding: { top: 16, bottom: 24 },
          unicodeHighlight: {
            ambiguousCharacters: false,
            invisibleCharacters: false,
          },
          quickSuggestions: {
            strings: true,
            comments: false,
            other: true,
          },
        }}
      />
    </div>
  );
};
