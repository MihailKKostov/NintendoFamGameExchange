import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { play } from '../lib/sounds';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
  leaving?: boolean;
}

interface ToastApi {
  success: (text: string) => void;
  error: (err: unknown) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: Tone, text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    play(tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'pop');
    const ttl = tone === 'error' ? 6000 : 3800;
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), ttl);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl + 300);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => push('success', text),
      info: (text) => push('info', text),
      error: (err) => push('error', err instanceof Error ? err.message : String(err)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}${t.leaving ? ' leaving' : ''}`}>
            {t.tone === 'success' ? <CircleCheck size={20} /> : t.tone === 'error' ? <CircleAlert size={20} /> : <Info size={20} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}
