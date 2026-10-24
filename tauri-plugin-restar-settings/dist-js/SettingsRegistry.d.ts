import type { SettingTabPlugin } from './types';
/**
 * 設定タブプラグインを登録・管理するレジストリ
 */
export declare class SettingsRegistry {
    private static instance;
    private plugins;
    private constructor();
    static getInstance(): SettingsRegistry;
    /**
     * 設定タブプラグインを登録
     */
    register(plugin: SettingTabPlugin): void;
    /**
     * 設定タブプラグインの登録解除
     */
    unregister(id: string): void;
    /**
     * 指定IDのプラグインを取得
     */
    get(id: string): SettingTabPlugin | undefined;
    /**
     * 全プラグインを表示優先度順（order昇順）で取得
     */
    getAll(): SettingTabPlugin[];
    /**
     * 全プラグインのデフォルト設定値をマージして取得
     */
    getAllDefaultValues(): Record<string, any>;
}
export declare const settingsRegistry: SettingsRegistry;
