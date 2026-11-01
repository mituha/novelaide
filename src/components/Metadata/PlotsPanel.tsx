import React from 'react';
import { ScrollText } from 'lucide-react';
import { BaseMetadataListPanel } from './BaseMetadataListPanel';

export const PlotsPanel: React.FC = () => {
  return (
    <BaseMetadataListPanel
      targetCategory="plot"
      defaultGrouping="book"
      panelTitle="プロット・構成"
      headerIcon={<ScrollText size={14} />}
    />
  );
};
