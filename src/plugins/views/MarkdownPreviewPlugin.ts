import { DocumentViewPlugin } from '../../types/viewPlugin';
import { MarkdownPreview } from '../../components/Preview/MarkdownPreview';

/**
 * Markdown プレビュープラグイン
 */
export const MarkdownPreviewPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.markdown.preview',
  name: 'Markdownプレビュー',
  viewMode: 'preview',
  supportedDocumentTypes: ['markdown'],
  priority: 10,
  component: MarkdownPreview,
};

/**
 * Markdown リーダープラグイン (閲覧モード)
 */
export const MarkdownReaderPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.markdown.reader',
  name: 'Markdown閲覧',
  viewMode: 'reader',
  supportedDocumentTypes: ['markdown'],
  priority: 5,
  component: MarkdownPreview,
};
