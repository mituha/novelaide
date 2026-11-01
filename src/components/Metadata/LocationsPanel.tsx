import React from 'react';
import { MapPin } from 'lucide-react';
import { BaseMetadataListPanel } from './BaseMetadataListPanel';

export const LocationsPanel: React.FC = () => {
  return (
    <BaseMetadataListPanel
      targetCategory="location"
      defaultGrouping="category"
      panelTitle="地名・施設・世界観"
      headerIcon={<MapPin size={14} />}
    />
  );
};
