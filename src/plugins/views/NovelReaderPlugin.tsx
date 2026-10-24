import React from 'react';
import { DocumentViewPlugin, DocumentViewProps } from '../../types/viewPlugin';
import { NovelPreview } from '../../components/Preview/NovelPreview';

const NovelReaderComponent: React.FC<DocumentViewProps> = (props) => {
  return <NovelPreview {...props} initialVertical={true} />;
};

/**
 * 小説縦書きリーダープラグイン (文庫本縦書き没入読書)
 */
export const NovelReaderPlugin: DocumentViewPlugin = {
  id: 'novelaid.view.novel.reader',
  name: 'リーダー',
  viewMode: 'reader',
  supportedDocumentTypes: ['novel'],
  priority: 10,
  component: NovelReaderComponent,
};
