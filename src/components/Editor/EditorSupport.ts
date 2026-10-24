import { Monaco } from '@monaco-editor/react';
import {
  NOVEL_MONARCH_PATTERNS,
  NOVEL_PATTERNS,
} from 'novelaid-ruby';

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

    // 4. 小説モード専用の補完（三点リーダー、ダッシュ、閉じ括弧）
    monaco.languages.registerCompletionItemProvider('novel', {
      provideCompletionItems: (model: any, position: any) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const charBefore =
          position.column > 1 ? lineContent[position.column - 2] : '';

        // 句読点や閉じ括弧の直後には表示しない
        const silentChars = ['。', '、', '」', '』'];
        if (silentChars.includes(charBefore)) {
          return { suggestions: [] };
        }

        const suggestions: any[] = [
          {
            label: '……',
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: '……',
            detail: '三点リーダー（2倍角）',
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          },
          {
            label: '――',
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: '――',
            detail: 'ダッシュ（2倍角）',
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          },
        ];

        // 閉じ括弧の補完ロジック
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

        const bracketPairs = [
          { open: '「', close: '」', label: '」 を閉じる' },
          { open: '『', close: '』', label: '』 を閉じる' },
          { open: '（', close: '）', label: '） を閉じる' },
          { open: '［', close: '］', label: '］ を閉じる' },
          { open: '【', close: '】', label: '】 を閉じる' },
        ];

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
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endColumn: position.column,
                },
              });
            }
          }
        }

        return { suggestions };
      },
    });
  }

  /**
   * エディターのデコレーション（全角スペース可視化等）を生成します
   */
  public static getEditorDecorations(model: any): any[] {
    const newDecorations: any[] = [];
    const text = model.getValue();

    // 全角スペースの可視化（novelaid-ruby の FULL_WIDTH_SPACE パターン使用）
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

    return newDecorations;
  }
}
