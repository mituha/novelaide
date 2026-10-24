import { SearchRegistry } from './SearchRegistry';
import { FullTextSearchProvider } from '../../plugins/search/FullTextSearchProvider';
import { MetadataSearchProvider } from '../../plugins/search/MetadataSearchProvider';
import { DialogueSearchProvider } from '../../plugins/search/DialogueSearchProvider';

export const searchRegistry = new SearchRegistry();

// 組み込みプロバイダーの登録
searchRegistry.register(FullTextSearchProvider);
searchRegistry.register(MetadataSearchProvider);
searchRegistry.register(DialogueSearchProvider);

export { SearchRegistry };
