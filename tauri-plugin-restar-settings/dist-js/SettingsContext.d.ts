import React, { type ReactNode } from 'react';
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
export interface SettingsProviderProps {
    children: ReactNode;
    initialTabId?: string;
    onSettingChange?: (key: string, value: any, allSettings: Record<string, any>) => void;
}
export declare const SettingsProvider: React.FC<SettingsProviderProps>;
export declare const useSettings: () => SettingsContextType;
