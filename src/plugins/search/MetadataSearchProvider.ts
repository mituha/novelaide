import { SearchProviderPlugin, SearchQuery, SearchMatch } from '../../types/searchPlugin';
import { fileService } from '../../services/fileService';

/**
 * 設定・メタデータ検索プロバイダー
 * フロントマターのタグ、登場人物、属性値を検索
 */
export const MetadataSearchProvider: SearchProviderPlugin = {
  id: 'novelaid.search.metadata',
  name: '設定・メタデータ',
  description: 'YAMLフロントマター内のタグや登場人物名、設定属性を検索',
  priority: 90,

  async search(query: SearchQuery, projectPath: string): Promise<SearchMatch[]> {
    if (!query.text.trim()) return [];

    const matches: SearchMatch[] = [];
    const lowerQuery = query.caseSensitive ? query.text : query.text.toLowerCase();

    try {
      const entries = await fileService.readDirectory(projectPath, true);

      const collectFiles = (items: typeof entries): typeof entries => {
        let files: typeof entries = [];
        for (const item of items) {
          if (item.isDirectory && item.children) {
            files = files.concat(collectFiles(item.children));
          } else if (!item.isDirectory) {
            files.push(item);
          }
        }
        return files;
      };

      const targetFiles = collectFiles(entries);

      for (const file of targetFiles) {
        const doc = await fileService.readFile(file.path);
        const metadata = doc.metadata || {};

        for (const [key, val] of Object.entries(metadata)) {
          const strVal = String(val);
          const checkVal = query.caseSensitive ? strVal : strVal.toLowerCase();

          if (checkVal.includes(lowerQuery) || key.toLowerCase().includes(lowerQuery)) {
            matches.push({
              filePath: file.path,
              fileTitle: file.baseName,
              lineNumber: 1,
              column: 1,
              matchLength: query.text.length,
              previewLine: `${key}: ${strVal}`,
              extraInfo: `属性: ${key}`,
            });
          }
        }
      }
    } catch (err) {
      console.error('Metadata search failed:', err);
    }

    return matches;
  },
};
