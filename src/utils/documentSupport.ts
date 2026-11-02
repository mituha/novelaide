import { NovelaidDocumentType, DocumentViewMode } from '../types/document';
import { viewRegistry } from '../core/viewRegistry';

/**
 * 指定されたドキュメント種別で利用可能な全ビューモードを取得
 */
export function getSupportedViewModes(
  docType: NovelaidDocumentType | string | undefined
): DocumentViewMode[] {
  if (!docType) return ['editor'];
  return viewRegistry.getSupportedViewModes(docType as NovelaidDocumentType);
}

/**
 * 指定されたドキュメント種別が、特定のビューモードをサポートしているか判定
 */
export function isViewModeSupported(
  docType: NovelaidDocumentType | string | undefined,
  viewMode: DocumentViewMode
): boolean {
  if (!docType) return viewMode === 'editor';
  return viewRegistry.isViewModeSupported(docType as NovelaidDocumentType, viewMode);
}

/**
 * ドキュメントを開く際の推奨初期ビューモードを取得
 */
export function getInitialViewMode(
  docType?: NovelaidDocumentType | string
): DocumentViewMode {
  if (docType === 'chat') return 'canvas';
  if (docType === 'image') return 'preview';
  return 'editor';
}
