import React from 'react';
import { Users } from 'lucide-react';
import { BaseMetadataListPanel } from './BaseMetadataListPanel';

export const CharactersPanel: React.FC = () => {
  return (
    <BaseMetadataListPanel
      targetCategory="character"
      defaultGrouping="role"
      panelTitle="登場人物"
      headerIcon={<Users size={14} />}
    />
  );
};
