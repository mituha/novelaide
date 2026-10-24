import { SearchProviderPlugin, SearchQuery, SearchMatch } from '../../types/searchPlugin';
import { fileService } from '../../services/fileService';

/**
 * 本文全文検索プロバイダー
 * プロジェクト内の全テキスト・Markdown原稿を横断スキャン
 */
export const FullTextSearchProvider: SearchProviderPlugin = {
  id: 'novelaid.search.fulltext',
  name: '本文全文',
  description: '小説原稿および設定資料のすべての文章を検索',
  priority: 100,

  async search(query: SearchQuery, projectPath: string): Promise<SearchMatch[]> {
    if (!query.text.trim()) return [];

    const matches: SearchMatch[] = [];
    try {
      const entries = await fileService.readDirectory(projectPath, true);

      // 再帰的にテキスト・Markdownファイルを収集
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

      // 検索正規表現の構築
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

      // 各ファイルの内容をスキャン
      for (const file of targetFiles) {
        const doc = await fileService.readFile(file.path);
        const lines = doc.content.split('\n');

        lines.forEach((line, lineIdx) => {
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
            });
            if (!regex.global) break;
          }
        });
      }
    } catch (err) {
      console.error('FullText search failed:', err);
    }

    return matches;
  },
};
