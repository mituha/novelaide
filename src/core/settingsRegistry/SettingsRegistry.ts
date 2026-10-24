import type { SettingTabPlugin } from '../../types/settingsPlugin';

/**
 * 設定タブプラグインを登録・管理するレジストリ
 */
export class SettingsRegistry {
  private static instance: SettingsRegistry;
  private plugins: Map<string, SettingTabPlugin> = new Map();

  private constructor() {}

  public static getInstance(): SettingsRegistry {
    if (!SettingsRegistry.instance) {
      SettingsRegistry.instance = new SettingsRegistry();
    }
    return SettingsRegistry.instance;
  }

  /**
   * 設定タブプラグインを登録
   */
  public register(plugin: SettingTabPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[SettingsRegistry] SettingTabPlugin with id "${plugin.id}" is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * 設定タブプラグインの登録解除
   */
  public unregister(id: string): void {
    this.plugins.delete(id);
  }

  /**
   * 指定IDのプラグインを取得
   */
  public get(id: string): SettingTabPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * 全プラグインを表示優先度順（order昇順）で取得
   */
  public getAll(): SettingTabPlugin[] {
    return Array.from(this.plugins.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * 全プラグインのデフォルト設定値をマージして取得
   */
  public getAllDefaultValues(): Record<string, any> {
    const defaults: Record<string, any> = {};
    for (const plugin of this.plugins.values()) {
      Object.assign(defaults, plugin.defaultValues);
    }
    return defaults;
  }
}

export const settingsRegistry = SettingsRegistry.getInstance();
