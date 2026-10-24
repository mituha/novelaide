import { PanelPlugin } from '../../types/panelPlugin';
import { ListTree } from 'lucide-react';
import { DocumentOutline } from '../../components/Outline/DocumentOutline';

export const OutlinePanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.outline',
  title: '見出しアウトライン',
  icon: ListTree,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'document',
  priority: 100,
  component: DocumentOutline,
};
