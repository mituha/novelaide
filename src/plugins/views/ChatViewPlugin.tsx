import { DocumentViewPlugin } from '../../types/viewPlugin';
import { ChatView } from '../../components/Chat/ChatView';

/**
 * AI チャットドキュメント用ビュープラグイン (.ch ファイル)
 * viewMode: 'canvas' を担当
 */
export const ChatViewPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.chat',
  name: 'チャット',
  viewMode: 'canvas',
  supportedDocumentTypes: ['chat'],
  priority: 10,
  component: ChatView as any,
};
