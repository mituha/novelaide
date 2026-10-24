import React from 'react';
export interface SettingsModalProps {
    title?: string;
    customIcons?: Record<string, React.ReactNode>;
}
export declare const SettingsModal: React.FC<SettingsModalProps>;
