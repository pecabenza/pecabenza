'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';

export type SystemDialogVariant = 'info' | 'success' | 'warning' | 'danger' | 'error';

export interface AlertOptions {
  title?: string;
  message: string;
  variant?: SystemDialogVariant;
  confirmLabel?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  variant?: SystemDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ActiveDialogState {
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  variant: SystemDialogVariant;
  confirmLabel: string;
  cancelLabel: string;
  placeholder?: string;
  required?: boolean;
  resolve: (value: any) => void;
}

interface SystemDialogContextValue {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
  showPrompt: (options: PromptOptions) => Promise<string | null>;
}

const SystemDialogContext = createContext<SystemDialogContextValue | null>(null);

export function useSystemDialog(): SystemDialogContextValue {
  const ctx = useContext(SystemDialogContext);
  if (!ctx) {
    throw new Error('useSystemDialog must be used inside SystemDialogProvider');
  }
  return ctx;
}

export function SystemDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<ActiveDialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const closeWith = useCallback(
    (result: any) => {
      if (!dialog) return;
      const resolver = dialog.resolve;
      setDialog(null);
      resolver(result);
    },
    [dialog]
  );

  const showAlert = useCallback((options: AlertOptions | string): Promise<void> => {
    const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<void>((resolve) => {
      setDialog({
        kind: 'alert',
        title: opts.title || (opts.variant === 'error' ? 'Atenção' : 'Aviso do Sistema'),
        message: opts.message,
        variant: opts.variant || 'info',
        confirmLabel: opts.confirmLabel || 'Entendi',
        cancelLabel: 'Fechar',
        resolve: () => resolve(),
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setDialog({
        kind: 'confirm',
        title: opts.title || 'Confirmação',
        message: opts.message,
        variant: opts.variant || 'warning',
        confirmLabel: opts.confirmLabel || 'Confirmar',
        cancelLabel: opts.cancelLabel || 'Cancelar',
        resolve,
      });
    });
  }, []);

  const showPrompt = useCallback((options: PromptOptions): Promise<string | null> => {
    setPromptValue(options.defaultValue || '');
    return new Promise<string | null>((resolve) => {
      setDialog({
        kind: 'prompt',
        title: options.title || 'Informação Necessária',
        message: options.message,
        variant: 'info',
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        placeholder: options.placeholder,
        required: options.required,
        resolve,
      });
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const timer = setTimeout(() => {
      if (dialog.kind === 'prompt') {
        promptInputRef.current?.focus();
      } else {
        primaryButtonRef.current?.focus();
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeWith(dialog.kind === 'confirm' ? false : dialog.kind === 'prompt' ? null : undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dialog, closeWith]);

  const renderIcon = (variant: SystemDialogVariant, kind: ActiveDialogState['kind']) => {
    if (variant === 'danger' || variant === 'error') {
      return (
        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
      );
    }
    if (variant === 'warning') {
      return (
        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
      );
    }
    if (variant === 'success') {
      return (
        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      );
    }
    if (kind === 'confirm' || kind === 'prompt') {
      return (
        <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
        <Info className="w-5 h-5" />
      </div>
    );
  };

  const confirmButtonClass =
    dialog?.variant === 'danger' || dialog?.variant === 'error'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : dialog?.variant === 'success'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-stone-900 hover:bg-stone-800 text-white';

  return (
    <SystemDialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs print:hidden"
          onClick={() =>
            closeWith(dialog.kind === 'confirm' ? false : dialog.kind === 'prompt' ? null : undefined)
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-dialog-title"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 flex items-start gap-4">
              {renderIcon(dialog.variant, dialog.kind)}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 id="system-dialog-title" className="text-base font-bold text-stone-900">
                    {dialog.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      closeWith(
                        dialog.kind === 'confirm' ? false : dialog.kind === 'prompt' ? null : undefined
                      )
                    }
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                  {dialog.message}
                </p>

                {dialog.kind === 'prompt' && (
                  <input
                    ref={promptInputRef}
                    type="text"
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    placeholder={dialog.placeholder}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (dialog.required && !promptValue.trim()) return;
                        closeWith(promptValue.trim());
                      }
                    }}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                  />
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2">
              {dialog.kind !== 'alert' && (
                <button
                  type="button"
                  onClick={() => closeWith(dialog.kind === 'confirm' ? false : null)}
                  className="px-4 py-2 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                ref={primaryButtonRef}
                type="button"
                disabled={dialog.kind === 'prompt' && dialog.required && !promptValue.trim()}
                onClick={() => {
                  if (dialog.kind === 'alert') closeWith(undefined);
                  else if (dialog.kind === 'confirm') closeWith(true);
                  else closeWith(promptValue.trim());
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50 ${confirmButtonClass}`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </SystemDialogContext.Provider>
  );
}

