import { Monaco } from '@monaco-editor/react';
import {
  NOVEL_BRACKET_PAIRS,
  NOVEL_MONARCH_PATTERNS,
  NOVEL_PATTERNS,
} from 'tauri-plugin-novelaid-ruby-api';

/**
 * 小説エディターのドキュメントタイプ別の機能およびMonaco設定を管理するクラス
 * （novelaid-editor の実装に準拠）
 */
export class EditorSupport {
  /**
   * Monacoのグローバル設定（言語定義やテーマ、補完）を登録します
   */
  public static registerLanguages(monaco: Monaco) {
    if (monaco.languages.getLanguages().some((lang: any) => lang.id === 'novel')) {
      return;
    }

    // 1. novel 言語の登録
    monaco.languages.register({ id: 'novel' });

    // 2. Monarch トークナイザーの定義 (会話文・ルビ・傍点)
    monaco.languages.setMonarchTokensProvider('novel', {
      tokenizer: {
        root: [
          [
            NOVEL_MONARCH_PATTERNS.DIALOGUE_START,
            { token: 'novel.dialogue', next: '@dialogue' },
          ],
          [
            NOVEL_MONARCH_PATTERNS.DIALOGUE_DOUBLE_START,
            { token: 'novel.dialogue', next: '@dialogue_double' },
          ],
          [NOVEL_MONARCH_PATTERNS.RUBY_PIPE, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.RUBY_KANJI, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.BOUTEN, 'novel.bouten'],
          { include: '@whitespace' },
        ],
        dialogue: [
          [
            NOVEL_MONARCH_PATTERNS.DIALOGUE_END,
            { token: 'novel.dialogue', next: '@pop' },
          ],
          [NOVEL_MONARCH_PATTERNS.RUBY_PIPE, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.RUBY_KANJI, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.BOUTEN, 'novel.bouten'],
          [/./, 'novel.dialogue'],
        ],
        dialogue_double: [
          [
            NOVEL_MONARCH_PATTERNS.DIALOGUE_DOUBLE_END,
            { token: 'novel.dialogue', next: '@pop' },
          ],
          [NOVEL_MONARCH_PATTERNS.RUBY_PIPE, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.RUBY_KANJI, 'novel.ruby'],
          [NOVEL_MONARCH_PATTERNS.BOUTEN, 'novel.bouten'],
          [/./, 'novel.dialogue'],
        ],
        whitespace: [[/[ \t\r\n]+/, 'white']],
      },
    });

    // 3. テーマの定義
    monaco.editor.defineTheme('novel-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'novel.dialogue', foreground: 'A6E22E' }, // 明るい緑
        { token: 'novel.ruby', foreground: '66D9EF', fontStyle: 'italic' }, // 水色イタリック
        { token: 'novel.bouten', foreground: 'FD971F', fontStyle: 'bold' }, // オレンジ太字
      ],
      colors: {},
    });

    monaco.editor.defineTheme('novel-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'novel.dialogue', foreground: '008000' }, // 濃い緑
        { token: 'novel.ruby', foreground: '0055D4', fontStyle: 'italic' }, // ブルー
        { token: 'novel.bouten', foreground: 'D84315', fontStyle: 'bold' }, // 赤茶
      ],
      colors: {},
    });

    monaco.editor.defineTheme('novel-sepia', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'novel.dialogue', foreground: '2E6830' },
        { token: 'novel.ruby', foreground: '1A5276', fontStyle: 'italic' },
        { token: 'novel.bouten', foreground: 'BA4A00', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#F4ECD8',
        'editor.foreground': '#433422',
        'editorLineNumber.foreground': '#8D7B68',
        'editorLineNumber.activeForeground': '#433422',
        'editorCursor.foreground': '#433422',
        'editor.selectionBackground': '#E2D5B8',
        'editor.lineHighlightBackground': '#EDE4CD40',
      },
    });

    // 4. 小説・マークダウン執筆用の補完プロバイダ（三点リーダー、ダッシュ、ルビ、傍点、閉じ括弧）
    ['novel', 'markdown'].forEach((lang) => {
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (model: any, position: any) => {
          // カーソル位置への新規挿入（直前文字列を置換しないため幅0のカーソル位置を指定）
          const insertRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column,
          };

          const suggestions: any[] = [
            {
              label: '……',
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: '……',
              detail: '三点リーダー（2倍角）',
              documentation: '小説用三点リーダー（……）を挿入します。',
              range: insertRange,
            },
            {
              label: '――',
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: '――',
              detail: 'ダッシュ（2倍角）',
              documentation: '小説用ダッシュ（――）を挿入します。',
              range: insertRange,
            },
            {
              label: '｜漢字《かんじ》',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '｜${1:漢字}《${2:よみ}》',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'ルビ記法（novelaid標準）',
              documentation: '小説ルビ記法スニペット。Tabキーで漢字と読みに順次ジャンプできます。',
              range: insertRange,
            },
            {
              label: '《《傍点》》',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '《《${1:テキスト}》》',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: '傍点記法（強調）',
              documentation: '傍点記法スニペット。Tabキーでテキスト部分を直接入力できます。',
              range: insertRange,
            },
          ];

          // 閉じ括弧の補完ロジック（tauri-plugin-novelaid-ruby 一元管理定義を使用）
          const textBefore = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          const textAfter = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: model.getLineCount(),
            endColumn: model.getLineMaxColumn(model.getLineCount()),
          });

          const bracketPairs = NOVEL_BRACKET_PAIRS;

          for (const pair of bracketPairs) {
            const lastOpenIdx = textBefore.lastIndexOf(pair.open);
            const lastCloseIdx = textBefore.lastIndexOf(pair.close);

            if (lastOpenIdx > lastCloseIdx) {
              const nextOpenIdx = textAfter.indexOf(pair.open);
              const nextCloseIdx = textAfter.indexOf(pair.close);

              if (
                nextCloseIdx === -1 ||
                (nextOpenIdx !== -1 && nextCloseIdx > nextOpenIdx)
              ) {
                suggestions.push({
                  label: pair.close,
                  kind: monaco.languages.CompletionItemKind.Text,
                  insertText: pair.close,
                  detail: pair.label,
                  range: insertRange,
                });
              }
            }
          }

          return { suggestions };
        },
      });
    });

    // 5. 小説・マークダウン共通のメタデータ補完（登場人物・場所等）
    ['novel', 'markdown'].forEach((lang) => {
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (_model: any, position: any) => {
          const metaEntries: Array<{ name: string; type: 'character' | 'location' }> =
            (window as any).__novelaid_metadata_completions || [];

          if (!metaEntries.length) return { suggestions: [] };

          const suggestions = metaEntries.map((entry) => ({
            label: entry.name,
            kind:
              entry.type === 'character'
                ? monaco.languages.CompletionItemKind.User
                : monaco.languages.CompletionItemKind.Class,
            insertText: entry.name,
            detail: entry.type === 'character' ? '登場人物' : '地名・舞台',
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          }));

          return { suggestions };
        },
      });
    });
  }

  /**
   * 指定記号で選択領域を囲みます
   */
  public static wrapSelection(
    editor: any,
    prefix: string,
    suffix: string,
    label: string = 'wrap-action',
  ) {
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const text = model.getValueInRange(selection);
    const range = {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    };

    const newText = `${prefix}${text}${suffix}`;
    const op = {
      identifier: { major: 1, minor: 1 },
      range,
      text: newText,
      forceMoveMarkers: true,
    };

    editor.executeEdits(label, [op]);

    if (text === '') {
      const newColumn = selection.startColumn + prefix.length;
      editor.setPosition({
        lineNumber: selection.startLineNumber,
        column: newColumn,
      });
    }
  }

  /**
   * カーソル位置に単語を挿入します（選択範囲を上書き）
   */
  public static insertWord(
    editor: any,
    word: string,
    label: string = 'insert-word',
  ) {
    const selection = editor.getSelection();
    if (!selection) return;

    const op = {
      identifier: { major: 1, minor: 1 },
      range: selection,
      text: word,
      forceMoveMarkers: true,
    };
    editor.executeEdits(label, [op]);
  }

  /**
   * エディターインスタンスごとの設定・コンテキストメニューアクションを適用します
   */
  public static setupEditorInstance(
    editor: any,
    monaco: Monaco,
    docType: string,
    callbacks: {
      onOpenRubyDialog: (selectedText: string) => void;
    }
  ) {
    const isNovel = docType === 'novel';
    const isMarkdown = docType === 'markdown';

    if (isNovel || isMarkdown) {
      // ルビを振る
      editor.addAction({
        id: 'insert-ruby',
        label: 'ルビを振る',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: () => {
          const selection = editor.getSelection();
          const model = editor.getModel();
          if (selection && model) {
            const text = model.getValueInRange(selection);
            if (text) {
              callbacks.onOpenRubyDialog(text);
            }
          }
        },
      });

      // 傍点を振る
      editor.addAction({
        id: 'insert-bouten',
        label: '傍点を振る',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.6,
        run: () => this.wrapSelection(editor, '《《', '》》', 'insert-bouten'),
      });

      // 「」を追加
      editor.addAction({
        id: 'insert-corner-brackets',
        label: '「」を追加',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketLeft],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.7,
        run: () => this.wrapSelection(editor, '「', '」', 'insert-corner-brackets'),
      });

      // 『』を追加
      editor.addAction({
        id: 'insert-corner-brackets2',
        label: '『』を追加',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.8,
        run: () => this.wrapSelection(editor, '『', '』', 'insert-corner-brackets2'),
      });

      // ―― を追加
      editor.addAction({
        id: 'insert-dash',
        label: '―― を追加',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Minus],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2.1,
        run: () => this.insertWord(editor, '――', 'insert-dash'),
      });

      // …… を追加
      editor.addAction({
        id: 'insert-ellipsis',
        label: '…… を追加',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Period],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2.2,
        run: () => this.insertWord(editor, '……', 'insert-ellipsis'),
      });
    }
  }

  /**
   * エディターのデコレーション（全角スペース可視化、ルビ・傍点ホバー）を生成します
   */
  public static getEditorDecorations(model: any): any[] {
    const newDecorations: any[] = [];
    const text = model.getValue();

    // 1. 全角スペースの可視化（novelaid-ruby の FULL_WIDTH_SPACE パターン使用）
    const regex = new RegExp(NOVEL_PATTERNS.FULL_WIDTH_SPACE.source, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + 1);
      newDecorations.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          inlineClassName: 'monaco-full-width-space',
          stickiness: 1, // TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        },
      });
    }

    // 2. ルビのハイライト (マークダウンと小説両方)
    const usedRanges: { start: number; end: number }[] = [];
    const rubyPipePattern = new RegExp(NOVEL_PATTERNS.RUBY_WITH_PIPE.source, 'g');
    let rubyMatch;
    while ((rubyMatch = rubyPipePattern.exec(text)) !== null) {
      const startPos = model.getPositionAt(rubyMatch.index);
      const endPos = model.getPositionAt(rubyMatch.index + rubyMatch[0].length);
      usedRanges.push({ start: rubyMatch.index, end: rubyMatch.index + rubyMatch[0].length });
      newDecorations.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          hoverMessage: { value: 'ルビ記法: `' + rubyMatch[0] + '`' },
        },
      });
    }

    // 3. 傍点のハイライト
    const boutenPattern = new RegExp(NOVEL_PATTERNS.BOUTEN.source, 'g');
    let boutenMatch;
    while ((boutenMatch = boutenPattern.exec(text)) !== null) {
      const startPos = model.getPositionAt(boutenMatch.index);
      const endPos = model.getPositionAt(boutenMatch.index + boutenMatch[0].length);
      newDecorations.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          hoverMessage: { value: '傍点記法: `' + boutenMatch[0] + '`' },
        },
      });
    }

    return newDecorations;
  }
}
