import { PanelPlugin } from '../../types/panelPlugin';
import { Users } from 'lucide-react';
import { CharactersPanel } from '../../components/Metadata/CharactersPanel';

export const CharactersPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.characters',
  title: '登場人物',
  icon: Users,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 65,
  component: CharactersPanel,
};
