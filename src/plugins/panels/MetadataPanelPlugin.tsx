import { PanelPlugin } from '../../types/panelPlugin';
import { Database } from 'lucide-react';
import { MetadataPanel } from '../../components/Metadata/MetadataPanel';

export const MetadataPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.metadata',
  title: 'メタデータ (Frontmatter)',
  icon: Database,
  defaultPlacement: 'right',
  allowedPlacements: ['right', 'left'],
  scope: 'document',
  priority: 90,
  component: MetadataPanel,
};
