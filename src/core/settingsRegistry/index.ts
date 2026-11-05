import { settingsRegistry } from 'restar-app-settings';
import { generalSettingsPlugin } from '../../plugins/settings/GeneralSettingsPlugin';
import { appearanceSettingsPlugin } from '../../plugins/settings/AppearanceSettingsPlugin';
import { editorSettingsPlugin } from '../../plugins/settings/EditorSettingsPlugin';
import { novelPreviewSettingsPlugin } from '../../plugins/settings/NovelPreviewSettingsPlugin';
import { aiSettingsPlugin } from '../../plugins/settings/AiSettingsPlugin';

// 小説エディター用設定タブプラグインを登録
settingsRegistry.register(generalSettingsPlugin);
settingsRegistry.register(appearanceSettingsPlugin);
settingsRegistry.register(editorSettingsPlugin);
settingsRegistry.register(novelPreviewSettingsPlugin);
settingsRegistry.register(aiSettingsPlugin);

export { settingsRegistry };
