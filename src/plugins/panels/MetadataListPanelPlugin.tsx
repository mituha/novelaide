import { PanelPlugin } from '../../types/panelPlugin';
import { Users } from 'lucide-react';
import { MetadataListPanel } from '../../components/Metadata/MetadataListPanel';

export const MetadataListPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.metadataList',
  title: '設定資料・登場人物',
  icon: Users,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 70,
  component: MetadataListPanel,
};
