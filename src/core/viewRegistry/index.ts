import { ViewRegistry } from './ViewRegistry';
import { TextEditorPlugin } from '../../plugins/views/TextEditorPlugin';
import { NovelPreviewPlugin } from '../../plugins/views/NovelPreviewPlugin';
import { NovelReaderPlugin } from '../../plugins/views/NovelReaderPlugin';
import {
  MarkdownPreviewPlugin,
  MarkdownReaderPlugin,
} from '../../plugins/views/MarkdownPreviewPlugin';
import { ImagePreviewPlugin } from '../../plugins/views/ImagePreviewPlugin';
import { ChatViewPlugin } from '../../plugins/views/ChatViewPlugin';

// シングルトンインスタンスの作成
export const viewRegistry = new ViewRegistry();

// 組み込みプラグインの登録
viewRegistry.register(TextEditorPlugin);
viewRegistry.register(NovelPreviewPlugin);
viewRegistry.register(NovelReaderPlugin);
viewRegistry.register(MarkdownPreviewPlugin);
viewRegistry.register(MarkdownReaderPlugin);
viewRegistry.register(ImagePreviewPlugin);
viewRegistry.register(ChatViewPlugin);

export { ViewRegistry };
