import React from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useNotification, NotificationType } from '../../contexts/NotificationContext';
import './BannerContainer.css';

const getBannerIcon = (type: NotificationType) => {
  switch (type) {
    case 'warning':
      return <AlertTriangle size={15} className="banner-icon warning" />;
    case 'error':
      return <AlertCircle size={15} className="banner-icon error" />;
    case 'info':
    default:
      return <Info size={15} className="banner-icon info" />;
  }
};

export const BannerContainer: React.FC = () => {
  const { banners, dismissBanner } = useNotification();

  if (banners.length === 0) return null;

  return (
    <div className="banner-container">
      {banners.map((banner) => (
        <div key={banner.id} className={`banner-item ${banner.type}`}>
          <div className="banner-left">
            {getBannerIcon(banner.type)}
            <span className="banner-message">{banner.message}</span>
          </div>

          <div className="banner-actions">
            {banner.actions?.map((act, idx) => (
              <button
                key={idx}
                type="button"
                className={`banner-btn ${act.primary ? 'primary' : ''}`}
                onClick={() => {
                  act.onClick();
                  dismissBanner(banner.id);
                }}
              >
                {act.label}
              </button>
            ))}

            <button
              type="button"
              className="banner-close-btn"
              onClick={() => dismissBanner(banner.id)}
              title="閉じる"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
