import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { settingsRegistry } from './SettingsRegistry';

const SETTINGS_STORAGE_KEY = 'restar-app-settings';

export interface SettingsContextType {
  settings: Record<string, any>;
  updateSetting: <T>(key: string, value: T) => void;
  resetSetting: (key: string) => void;
  isSettingsOpen: boolean;
  openSettings: (tabId?: string) => void;
  closeSettings: () => void;
  activeTabId: string;
  setActiveTabId: (tabId: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export interface SettingsProviderProps {
  children: ReactNode;
  initialTabId?: string;
  onSettingChange?: (key: string, value: any, allSettings: Record<string, any>) => void;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
  children,
  initialTabId = 'appearance',
  onSettingChange,
}) => {
  const [settings, setSettings] = useState<Record<string, any>>(() => {
    const defaults = settingsRegistry.getAllDefaultValues();
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch {
      // LocalStorage load error fallback
    }
    return defaults;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId);

  // Tauriネイティブ設定ファイルからのロード
  useEffect(() => {
    async function loadNativeSettings() {
      try {
        const nativeSettings = await invoke<Record<string, any>>('plugin:restar-settings|load_settings');
        if (nativeSettings && Object.keys(nativeSettings).length > 0) {
          setSettings((prev) => ({ ...prev, ...nativeSettings }));
        }
      } catch {
        // Tauri環境外や初回起動時は無視
      }
    }
    loadNativeSettings();
  }, []);

  // 設定値の更新
  const updateSetting = useCallback(<T,>(key: string, value: T) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };

      // LocalStorage 保存（フォールバック）
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // LocalStorage save error
      }

      // Tauri ネイティブ保存
      invoke('plugin:restar-settings|save_settings', { settings: next }).catch(() => {
        // Non-tauri environment or error
      });

      // 外部コールバック通知
      if (onSettingChange) {
        onSettingChange(key, value, next);
      }

      return next;
    });
  }, [onSettingChange]);

  // 設定値のリセット
  const resetSetting = useCallback((key: string) => {
    const defaults = settingsRegistry.getAllDefaultValues();
    if (key in defaults) {
      updateSetting(key, defaults[key]);
    }
  }, [updateSetting]);

  // モーダル開閉
  const openSettings = useCallback((tabId?: string) => {
    if (tabId) {
      setActiveTabId(tabId);
    }
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  // Ctrl + , (Cmd + ,) ショートカットキーで設定を開く
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSetting,
        resetSetting,
        isSettingsOpen,
        openSettings,
        closeSettings,
        activeTabId,
        setActiveTabId,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
