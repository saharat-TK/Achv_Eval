'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

type Variant = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  acknowledgementLabel?: string;
  confirmationText?: string;
  confirmationTextLabel?: string;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmDialogProvider>');
  }
  return ctx;
}

export default function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const resolverRef = useRef<Resolver | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setAcknowledged(false);
      setTypedConfirmation('');
      setOpts(next);
    });
  }, []);

  const resolve = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
    setAcknowledged(false);
    setTypedConfirmation('');
  }, []);

  const requiresAcknowledgement = Boolean(opts?.acknowledgementLabel);
  const requiresConfirmationText = Boolean(opts?.confirmationText);
  const canConfirm =
    (!requiresAcknowledgement || acknowledged) &&
    (!requiresConfirmationText || typedConfirmation.trim() === opts?.confirmationText);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(false);
      if (e.key === 'Enter' && canConfirm) resolve(true);
    };
    window.addEventListener('keydown', onKey);
    // Focus the cancel button — safer default for destructive prompts.
    cancelButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [canConfirm, opts, resolve]);

  const variant: Variant = opts?.variant ?? 'default';
  const confirmCls =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-mfu-primary hover:opacity-90 text-white';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => resolve(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {variant === 'danger' && (
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
                  aria-hidden
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="confirm-dialog-title"
                  className="text-base font-semibold text-slate-800"
                >
                  {opts.title}
                </h2>
                {opts.message && (
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                    {opts.message}
                  </p>
                )}
                {opts.acknowledgementLabel && (
                  <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{opts.acknowledgementLabel}</span>
                  </label>
                )}
                {opts.confirmationText && (
                  <label className="mt-3 block text-sm text-slate-700">
                    {opts.confirmationTextLabel ?? (
                      <>
                        พิมพ์ <strong>{opts.confirmationText}</strong> เพื่อยืนยัน
                      </>
                    )}
                    <input
                      type="text"
                      value={typedConfirmation}
                      onChange={(e) => setTypedConfirmation(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => resolve(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {opts.cancelLabel ?? 'ยกเลิก'}
              </button>
              <button
                type="button"
                onClick={() => resolve(true)}
                disabled={!canConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${confirmCls}`}
              >
                {opts.confirmLabel ?? 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
