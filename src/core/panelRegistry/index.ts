import { PanelRegistry } from './PanelRegistry';
import { ExplorerPanelPlugin } from '../../plugins/panels/ExplorerPanelPlugin';
import { SearchPanelPlugin } from '../../plugins/panels/SearchPanelPlugin';
import { GitPanelPlugin } from '../../plugins/panels/GitPanelPlugin';
import { CharactersPanelPlugin } from '../../plugins/panels/CharactersPanelPlugin';
import { LocationsPanelPlugin } from '../../plugins/panels/LocationsPanelPlugin';
import { PlotsPanelPlugin } from '../../plugins/panels/PlotsPanelPlugin';
import { MetadataListPanelPlugin } from '../../plugins/panels/MetadataListPanelPlugin';
import { OutlinePanelPlugin } from '../../plugins/panels/OutlinePanelPlugin';
import { MetadataPanelPlugin } from '../../plugins/panels/MetadataPanelPlugin';
import { AiPanelPlugin } from '../../plugins/panels/AiPanelPlugin';
import { CalibrationPanelPlugin } from '../../plugins/panels/CalibrationPanelPlugin';
import { DebugPanelPlugin } from '../../plugins/panels/DebugPanelPlugin';

export const panelRegistry = new PanelRegistry();

// 組み込みパネルの登録
panelRegistry.register(ExplorerPanelPlugin);
panelRegistry.register(SearchPanelPlugin);
panelRegistry.register(GitPanelPlugin);
panelRegistry.register(CharactersPanelPlugin);
panelRegistry.register(LocationsPanelPlugin);
panelRegistry.register(PlotsPanelPlugin);
panelRegistry.register(MetadataListPanelPlugin);
panelRegistry.register(OutlinePanelPlugin);
panelRegistry.register(MetadataPanelPlugin);
panelRegistry.register(CalibrationPanelPlugin);
panelRegistry.register(AiPanelPlugin);
panelRegistry.register(DebugPanelPlugin);

export { PanelRegistry };
