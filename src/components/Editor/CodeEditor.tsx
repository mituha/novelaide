import React, { useCallback, useRef, useEffect, useState } from 'react';
import MonacoEditor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { useTheme } from '../../contexts/ThemeContext';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';
import { useSettings } from 'restar-app-settings';
import { fileService } from '../../services/fileService';
import { EditorSupport } from './EditorSupport';
import { RubyDialog } from './RubyDialog';
import { DocumentViewProps } from '../../types/viewPlugin';
import './CodeEditor.css';

// Monaco Editor 標準コンテキストメニューの日本語ローカライズ辞書（完全ローカル）
const CONTEXT_MENU_TRANSLATIONS: Record<string, string> = {
  'Change All Occurrences': 'すべての出現箇所を変更',
  'Command Palette': 'コマンド パレット',
  'Cut': '切り取り',
  'Copy': 'コピー',
  'Paste': '貼り付け',
  'Select All': 'すべて選択',
  'Undo': '元に戻す',
  'Redo': 'やり直し',
  'Format Document': 'ドキュメントのフォーマット',
  'Go to Definition': '定義へ移動',
  'Peek Definition': '定義をここに表示',
};

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
  const { saveDocument, setCompositionState } = useDocument();
  const { projectPath } = useProject();
  const { settings } = useSettings();
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const saveDocumentRef = useRef(saveDocument);

  // ルビダイアログ用ステート
  const [isRubyDialogOpen, setIsRubyDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  // 表示するテキスト（content または value）
  const textValue = content !== undefined ? content : (value ?? '');

  // 言語の解決
  const effectiveLanguage = language || (documentType === 'markdown' ? 'markdown' : 'novel');

  useEffect(() => {
    saveDocumentRef.current = saveDocument;
  }, [saveDocument]);

  // メタデータ補完候補のロードとグローバルキャッシュ
  useEffect(() => {
    if (!projectPath) return;

    let isMounted = true;
    const scanMetadata = async () => {
      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const files: typeof entries = [];
        const collect = (items: typeof entries) => {
          for (const item of items) {
            if (item.isDirectory && item.children) {
              collect(item.children);
            } else if (!item.isDirectory && (item.path.endsWith('.md') || item.path.endsWith('.txt'))) {
              files.push(item);
            }
          }
        };
        collect(entries);

        const completions: Array<{ name: string; type: 'character' | 'location' }> = [];
        const seenNames = new Set<string>();

        for (const file of files) {
          const doc = await fileService.readFile(file.path);
          const meta = doc.metadata || {};
          const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
          const lowerPath = file.path.toLowerCase();

          const isChara =
            tags.some((t) => ['character', '登場人物', '人名', '人物', 'chara'].includes(t)) ||
            lowerPath.includes('character') ||
            lowerPath.includes('登場人物');

          const isLoc =
            tags.some((t) => ['location', 'places', '地名', '施設', '場所', 'place'].includes(t)) ||
            lowerPath.includes('location') ||
            lowerPath.includes('地名') ||
            lowerPath.includes('世界観');

          if (isChara || isLoc) {
            const candidateName = meta.name || meta.title || file.baseName.replace(/\.[^/.]+$/, '');
            if (candidateName && !seenNames.has(candidateName)) {
              seenNames.add(candidateName);
              completions.push({
                name: candidateName,
                type: isChara ? 'character' : 'location',
              });
            }
          }
        }

        if (isMounted) {
          (window as any).__novelaid_metadata_completions = completions;
        }
      } catch (err) {
        console.warn('Metadata completion scan error:', err);
      }
    };

    scanMetadata();
    return () => {
      isMounted = false;
    };
  }, [projectPath]);

  // ルビダイアログの開閉ハンドラ
  const handleOpenRubyDialog = useCallback((text: string) => {
    setSelectedText(text);
    setIsRubyDialogOpen(true);
  }, []);

  const handleRubyConfirm = useCallback(
    (ruby: string) => {
      if (editorRef.current && selectedText) {
        const selection = editorRef.current.getSelection();
        if (selection) {
          const range = {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          };
          const op = {
            identifier: { major: 1, minor: 1 },
            range,
            text: `|${selectedText}《${ruby}》`,
            forceMoveMarkers: true,
          };
          editorRef.current.executeEdits('ruby-insertion', [op]);
        }
      }
      setIsRubyDialogOpen(false);
    },
    [selectedText]
  );

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

    // 小説執筆支援コンテキストメニューアクションの登録
    EditorSupport.setupEditorInstance(editor, monaco, effectiveLanguage, {
      onOpenRubyDialog: handleOpenRubyDialog,
    });

    // テキスト変更時のデコレーション更新
    editor.onDidChangeModelContent(() => {
      updateDecorations(editor);
    });

    // ショートカットキー: Ctrl+S (Cmd+S) で手動保存（強制保存フラグ付与）
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveDocumentRef.current(undefined, { force: true });
    });

    // IME 入力（日本語変換）状態の監視
    if (typeof editor.onDidCompositionStart === 'function') {
      editor.onDidCompositionStart(() => {
        setCompositionState(true);
      });
    }
    if (typeof editor.onDidCompositionEnd === 'function') {
      editor.onDidCompositionEnd(() => {
        setCompositionState(false);
      });
    }

    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener('compositionstart', () => setCompositionState(true));
      domNode.addEventListener('compositionend', () => setCompositionState(false));
    }

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

    // 校正指摘マーカーの反映リスナー
    const handleCalibrationIssues = (e: any) => {
      const { path: eventPath, issues } = e.detail || {};
      if (eventPath !== path) return;
      const model = editor.getModel();
      if (!model) return;

      if (!issues || issues.length === 0) {
        monaco.editor.setModelMarkers(model, 'calibration', []);
        return;
      }

      const markers = issues.map((issue: any) => {
        let severity = monaco.MarkerSeverity.Warning;
        if (issue.ruleType === 'novel_style') {
          severity = monaco.MarkerSeverity.Info;
        } else if (issue.ruleType === 'grammar') {
          severity = monaco.MarkerSeverity.Error;
        }

        return {
          severity,
          message: `[校正] ${issue.message}${issue.suggestion ? ` (修正案: ${issue.suggestion})` : ''}`,
          startLineNumber: issue.range.startLine,
          startColumn: issue.range.startColumn,
          endLineNumber: issue.range.endLine,
          endColumn: issue.range.endColumn,
          source: '文章校正',
        };
      });

      monaco.editor.setModelMarkers(model, 'calibration', markers);
    };

    // エディタ位置へのジャンプリスナー
    const handleEditorJumpTo = (e: any) => {
      const { path: eventPath, line, column, endLine, endColumn } = e.detail || {};
      if (eventPath && eventPath !== path) return;

      const targetLine = line || 1;
      const targetCol = column || 1;
      const targetEndLine = endLine || targetLine;
      const targetEndCol = endColumn || targetCol;

      editor.revealRangeInCenter({
        startLineNumber: targetLine,
        startColumn: targetCol,
        endLineNumber: targetEndLine,
        endColumn: targetEndCol,
      });

      editor.setSelection({
        startLineNumber: targetLine,
        startColumn: targetCol,
        endLineNumber: targetEndLine,
        endColumn: targetEndCol,
      });

      editor.focus();
    };

    window.addEventListener('calibration-issues-update', handleCalibrationIssues);
    window.addEventListener('editor-jump-to', handleEditorJumpTo);

    // コンテキストメニューが開かれた際にDOM要素のラベルを日本語にローカライズ
    const localizeMenu = (root: ParentNode = document) => {
      const labels = root.querySelectorAll<HTMLElement>('.monaco-menu .action-label');
      labels.forEach((label) => {
        const text = label.textContent?.trim();
        if (text && CONTEXT_MENU_TRANSLATIONS[text]) {
          label.textContent = CONTEXT_MENU_TRANSLATIONS[text];
        }
      });
    };

    const menuObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (
                node.classList.contains('context-view') ||
                node.classList.contains('monaco-menu-container') ||
                node.querySelector('.monaco-menu')
              ) {
                localizeMenu(node);
              }
            }
          });
        }
      }
    });

    menuObserver.observe(document.body, { childList: true, subtree: true });

    const handleContextMenu = () => {
      requestAnimationFrame(() => localizeMenu(document.body));
    };
    window.addEventListener('contextmenu', handleContextMenu);

    // クリーンアップ
    editor.onDidDispose(() => {
      window.removeEventListener('calibration-issues-update', handleCalibrationIssues);
      window.removeEventListener('editor-jump-to', handleEditorJumpTo);
      menuObserver.disconnect();
      window.removeEventListener('contextmenu', handleContextMenu);
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
      <RubyDialog
        isOpen={isRubyDialogOpen}
        initialText={selectedText}
        onConfirm={handleRubyConfirm}
        onCancel={() => setIsRubyDialogOpen(false)}
      />
    </div>
  );
};
