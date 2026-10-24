import { DocumentViewPlugin } from '../../types/viewPlugin';
import { CodeEditor } from '../../components/Editor/CodeEditor';

/**
 * テキストエディタープラグイン (Monaco Editor)
 */
export const TextEditorPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.editor.text',
  name: 'エディター',
  viewMode: 'editor',
  supportedDocumentTypes: ['novel', 'markdown', 'css', 'unknown', 'chat'],
  priority: 10,
  component: CodeEditor as any,
};
