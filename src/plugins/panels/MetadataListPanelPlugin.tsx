import { PanelPlugin } from '../../types/panelPlugin';
import { Bookmark } from 'lucide-react';
import { MetadataListPanel } from '../../components/Metadata/MetadataListPanel';

export const MetadataListPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.metadataList',
  title: '設定資料・収集一覧',
  icon: Bookmark,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 68,
  component: MetadataListPanel,
};
