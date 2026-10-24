import { PanelRegistry } from './PanelRegistry';
import { FileExplorerPanelPlugin } from '../../plugins/panels/FileExplorerPanelPlugin';
import { OutlinePanelPlugin } from '../../plugins/panels/OutlinePanelPlugin';

export const panelRegistry = new PanelRegistry();

// 組み込みパネルの登録
panelRegistry.register(FileExplorerPanelPlugin);
panelRegistry.register(OutlinePanelPlugin);

export { PanelRegistry };
