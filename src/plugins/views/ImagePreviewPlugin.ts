import { DocumentViewPlugin } from '../../types/viewPlugin';
import { ImagePreview } from '../../components/Preview/ImagePreview';

/**
 * 画像プレビュープラグイン (ImageView)
 * マウスホイールズームおよびドラッグパンに対応した画像ビュー
 */
export const ImagePreviewPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.image.preview',
  name: '画像プレビュー',
  viewMode: 'preview',
  supportedDocumentTypes: ['image'],
  priority: 10,
  component: ImagePreview,
};
