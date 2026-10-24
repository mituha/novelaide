import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { settingsRegistry } from '../core/settingsRegistry';
import type { AppSettings } from '../types/settingsPlugin';
import { useTheme, type Theme } from './ThemeContext';

const SETTINGS_STORAGE_KEY = 'novelaide-settings';

interface SettingsContextType {
  settings: AppSettings;
  updateSetting: <T>(key: string, value: T) => void;
  resetSetting: (key: string) => void;
  isSettingsOpen: boolean;
  openSettings: (tabId?: string) => void;
  closeSettings: () => void;
  activeTabId: string;
  setActiveTabId: (tabId: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { theme, setTheme } = useTheme();

  // 初期設定値をレジストリのデフォルト値とローカルストレージから結合してロード
  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaults = settingsRegistry.getAllDefaultValues() as AppSettings;
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('[SettingsContext] Failed to load settings from localStorage:', e);
    }
    return defaults;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string>('appearance');

  // 設定値の更新
  const updateSetting = useCallback(<T,>(key: string, value: T) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('[SettingsContext] Failed to save settings to localStorage:', e);
      }
      return next;
    });

    // テーマ変更時は ThemeContext にも即座に同期
    if (key === 'theme') {
      setTheme(value as Theme);
    }
  }, [setTheme]);

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

  // ThemeContext の変更を settings に同期
  useEffect(() => {
    if (settings.theme !== theme && (theme === 'dark' || theme === 'light' || theme === 'sepia')) {
      setSettings((prev) => ({ ...prev, theme }));
    }
  }, [theme]);

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
