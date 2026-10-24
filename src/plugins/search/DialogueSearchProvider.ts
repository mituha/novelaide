import { SearchProviderPlugin, SearchQuery, SearchMatch } from '../../types/searchPlugin';
import { fileService } from '../../services/fileService';

/**
 * セリフ特化検索プロバイダー
 * 「」で囲まれた登場人物の会話文のみを対象に検索
 */
export const DialogueSearchProvider: SearchProviderPlugin = {
  id: 'novelaid.search.dialogue',
  name: 'セリフのみ',
  description: '地の文を除外し、会話文（「」内）のみを対象に口調や台詞を検索',
  priority: 80,

  async search(query: SearchQuery, projectPath: string): Promise<SearchMatch[]> {
    if (!query.text.trim()) return [];

    const matches: SearchMatch[] = [];
    try {
      const entries = await fileService.readDirectory(projectPath, true);

      const collectFiles = (items: typeof entries): typeof entries => {
        let files: typeof entries = [];
        for (const item of items) {
          if (item.isDirectory && item.children) {
            files = files.concat(collectFiles(item.children));
          } else if (!item.isDirectory && (item.documentType === 'novel' || item.documentType === 'markdown')) {
            files.push(item);
          }
        }
        return files;
      };

      const targetFiles = collectFiles(entries);

      let regex: RegExp;
      try {
        let pattern = query.useRegex ? query.text : query.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (query.wholeWord) {
          pattern = `\\b${pattern}\\b`;
        }
        regex = new RegExp(pattern, query.caseSensitive ? 'g' : 'gi');
      } catch (e) {
        console.error('Invalid search regex:', e);
        return [];
      }

      for (const file of targetFiles) {
        const doc = await fileService.readFile(file.path);
        const lines = doc.content.split('\n');

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();
          // 「」で囲まれたセリフ行かどうか
          const isDialogue = trimmed.startsWith('「') || trimmed.includes('「');
          if (!isDialogue) return;

          regex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(line)) !== null) {
            matches.push({
              filePath: file.path,
              fileTitle: file.baseName,
              lineNumber: lineIdx + 1,
              column: match.index + 1,
              matchLength: match[0].length,
              previewLine: line.trim(),
              extraInfo: '会話文',
            });
            if (!regex.global) break;
          }
        });
      }
    } catch (err) {
      console.error('Dialogue search failed:', err);
    }

    return matches;
  },
};
