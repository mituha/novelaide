import { PanelPlugin } from '../../types/panelPlugin';
import { MapPin } from 'lucide-react';
import { LocationsPanel } from '../../components/Metadata/LocationsPanel';

export const LocationsPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.locations',
  title: '地名・施設',
  icon: MapPin,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 66,
  component: LocationsPanel,
};
