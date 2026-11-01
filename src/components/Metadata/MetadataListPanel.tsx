import React from 'react';
import { Bookmark } from 'lucide-react';
import { BaseMetadataListPanel } from './BaseMetadataListPanel';

export const MetadataListPanel: React.FC = () => {
  return (
    <BaseMetadataListPanel
      targetCategory="all"
      defaultGrouping="category"
      panelTitle="設定資料・収集一覧"
      headerIcon={<Bookmark size={14} />}
    />
  );
};
