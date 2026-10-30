import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { confirm as tauriConfirm, message as tauriMessage } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  type?: NotificationType;
  title?: string;
  message: string;
  duration?: number; // ミリ秒（デフォルト: 3500ms、0で自動消去無効）
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: NotificationType;
  duration: number;
  createdAt: number;
}

export interface BannerAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface BannerOptions {
  id: string;
  type?: NotificationType;
  message: string;
  actions?: BannerAction[];
  onDismiss?: () => void;
}

export interface BannerItem extends BannerOptions {
  type: NotificationType;
}

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  kind?: 'warning' | 'info';
}

interface NotificationPayload {
  level?: 'toast' | 'banner' | 'status';
  type?: NotificationType;
  title?: string;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  // L1: ステータスバー短文メッセージ
  statusMessage: string | null;
  showStatusMessage: (message: string, duration?: number) => void;

  // L2: トースト（フローティング通知）
  toasts: ToastItem[];
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;

  // L3: エディタバナー（要判断の持続的通知）
  banners: BannerItem[];
  showBanner: (options: BannerOptions) => void;
  dismissBanner: (id: string) => void;

  // L4: 確認・警告ダイアログ（フロントエンド一元管理）
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
  alertDialog: (message: string, title?: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- L1: ステータスメッセージ ---
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showStatusMessage = useCallback((message: string, duration = 3000) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    setStatusMessage(message);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, duration);
  }, []);

  // --- L2: トースト通知 ---
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = options.id || `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newItem: ToastItem = {
      id,
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      duration: options.duration !== undefined ? options.duration : 3500,
      action: options.action,
      createdAt: Date.now(),
    };

    setToasts((prev) => [...prev.filter((t) => t.id !== id), newItem]);
    return id;
  }, []);

  // --- L3: バナー通知 ---
  const [banners, setBanners] = useState<BannerItem[]>([]);

  const dismissBanner = useCallback((id: string) => {
    setBanners((prev) => {
      const target = prev.find((b) => b.id === id);
      if (target?.onDismiss) {
        target.onDismiss();
      }
      return prev.filter((b) => b.id !== id);
    });
  }, []);

  const showBanner = useCallback((options: BannerOptions) => {
    const newItem: BannerItem = {
      ...options,
      type: options.type || 'info',
    };
    setBanners((prev) => [...prev.filter((b) => b.id !== options.id), newItem]);
  }, []);

  // --- L4: モーダルダイアログ ---
  const confirmDialog = useCallback(async (options: ConfirmDialogOptions): Promise<boolean> => {
    try {
      return await tauriConfirm(options.message, {
        title: options.title || '確認',
        kind: options.kind || 'warning',
        okLabel: options.okLabel || 'OK',
        cancelLabel: options.cancelLabel || 'キャンセル',
      });
    } catch {
      return window.confirm(options.message);
    }
  }, []);

  const alertDialog = useCallback(async (message: string, title = '通知'): Promise<void> => {
    try {
      await tauriMessage(message, {
        title,
        kind: 'info',
      });
    } catch {
      window.alert(message);
    }
  }, []);

  // --- バックエンドからの通知イベント (notification:push) の自動購読 ---
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<NotificationPayload>('notification:push', (event) => {
      const payload = event.payload;
      const level = payload.level || 'toast';

      if (level === 'status') {
        showStatusMessage(payload.message, payload.duration || 3000);
      } else if (level === 'banner') {
        showBanner({
          id: `backend-banner-${Date.now()}`,
          type: payload.type || 'info',
          message: payload.message,
        });
      } else {
        showToast({
          type: payload.type || 'info',
          title: payload.title,
          message: payload.message,
          duration: payload.duration,
        });
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, [showStatusMessage, showToast, showBanner]);

  return (
    <NotificationContext.Provider
      value={{
        statusMessage,
        showStatusMessage,
        toasts,
        showToast,
        dismissToast,
        banners,
        showBanner,
        dismissBanner,
        confirmDialog,
        alertDialog,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
