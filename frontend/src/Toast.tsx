import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Icon from './components/Icon';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastCtx {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastCtx>({ toasts: [], addToast: () => {} });

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon">
              <Icon name={t.type === 'success' ? 'check' : t.type === 'error' ? 'x' : 'alert'} />
            </span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
