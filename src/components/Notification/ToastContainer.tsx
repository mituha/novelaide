import React, { useEffect, useRef, useState } from 'react';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
} from 'lucide-react';
import { useNotification, ToastItem, NotificationType } from '../../contexts/NotificationContext';
import './ToastContainer.css';

const getIcon = (type: NotificationType) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={16} className="toast-icon success" />;
    case 'warning':
      return <AlertTriangle size={16} className="toast-icon warning" />;
    case 'error':
      return <AlertCircle size={16} className="toast-icon error" />;
    case 'info':
    default:
      return <Info size={16} className="toast-icon info" />;
  }
};

const SingleToast: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const [isHovered, setIsHovered] = useState(false);
  const remainingTimeRef = useRef(toast.duration);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (toast.duration <= 0) return;

    if (!isHovered) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, remainingTimeRef.current);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isHovered, toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`toast-item ${toast.type}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="alert"
    >
      <div className="toast-content-wrapper">
        <span className="toast-icon-container">{getIcon(toast.type)}</span>
        <div className="toast-text-area">
          {toast.title && <div className="toast-title">{toast.title}</div>}
          <div className="toast-message">{toast.message}</div>
        </div>

        {toast.action && (
          <button
            type="button"
            className="toast-action-btn"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}

        <button
          type="button"
          className="toast-close-btn"
          onClick={() => onDismiss(toast.id)}
          title="閉じる"
        >
          <X size={14} />
        </button>
      </div>

      {toast.duration > 0 && (
        <div
          className={`toast-progress-bar ${isHovered ? 'paused' : ''}`}
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
};
