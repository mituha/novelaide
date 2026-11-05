import { useEffect, useState } from 'react';
import { useSettings } from 'restar-app-settings';
import { useNotification } from '../contexts/NotificationContext';
import { updateService, type UpdateInfo } from '../services/updateService';

export function useAutoUpdate() {
  const { settings } = useSettings();
  const { showToast } = useNotification();
  const [activeUpdate, setActiveUpdate] = useState<UpdateInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // 起動時の自動チェック設定を確認（デフォルト: true）
    const shouldAutoCheck = settings?.autoCheckUpdateOnStartup !== false;
    if (!shouldAutoCheck) {
      return;
    }

    // 起動後 10 秒待機してからサイレントに確認
    const timer = setTimeout(async () => {
      try {
        const update = await updateService.checkForUpdate(true);
        if (update) {
          setActiveUpdate(update);
          showToast({
            type: 'info',
            title: 'アップデートが利用可能です',
            message: `novelaide v${update.version} が公開されました。`,
            duration: 12000,
            action: {
              label: '詳細を確認 / 更新',
              onClick: () => {
                setIsModalOpen(true);
              },
            },
          });
        }
      } catch (err) {
        console.warn('[useAutoUpdate] Silent check error:', err);
      }
    }, 10000);

    return () => {
      clearTimeout(timer);
    };
  }, [settings?.autoCheckUpdateOnStartup, showToast]);

  return {
    activeUpdate,
    isModalOpen,
    openModal: () => setIsModalOpen(true),
    closeModal: () => setIsModalOpen(false),
  };
}
