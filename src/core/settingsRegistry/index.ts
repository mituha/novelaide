import { settingsRegistry } from './SettingsRegistry';
import { appearanceSettingsPlugin } from '../../plugins/settings/AppearanceSettingsPlugin';
import { editorSettingsPlugin } from '../../plugins/settings/EditorSettingsPlugin';
import { novelPreviewSettingsPlugin } from '../../plugins/settings/NovelPreviewSettingsPlugin';

// 組み込み設定タブプラグインを登録
settingsRegistry.register(appearanceSettingsPlugin);
settingsRegistry.register(editorSettingsPlugin);
settingsRegistry.register(novelPreviewSettingsPlugin);

export { SettingsRegistry, settingsRegistry } from './SettingsRegistry';
