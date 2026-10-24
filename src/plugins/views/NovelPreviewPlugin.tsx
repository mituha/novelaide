import React from 'react';
import { DocumentViewPlugin, DocumentViewProps } from '../../types/viewPlugin';
import { NovelPreview } from '../../components/Preview/NovelPreview';

const NovelPreviewComponent: React.FC<DocumentViewProps> = (props) => {
  return <NovelPreview {...props} initialVertical={false} />;
};

/**
 * 小説組版プレビュープラグイン (横書き組版プレビュー)
 */
export const NovelPreviewPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.novel.preview',
  name: 'プレビュー',
  viewMode: 'preview',
  supportedDocumentTypes: ['novel'],
  priority: 10,
  component: NovelPreviewComponent,
};
