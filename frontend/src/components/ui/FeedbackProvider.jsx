import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FeedbackContext = createContext(null);

const TOAST_ICONS = {
  info: 'i',
  success: 'OK',
  error: '!',
  warning: '!',
};

const TOAST_ACCENTS = {
  info: '#5682B1',
  success: '#2D7A47',
  error: '#9F4A4A',
  warning: '#B7791F',
};

let toastSequence = 0;

function normalizeMessage(message) {
  if (message === null || message === undefined) return '';
  return typeof message === 'string' ? message : String(message);
}

export function FeedbackProvider({ children }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    intent: 'danger',
  });
  const confirmResolverRef = useRef(null);

  const dismissToast = useCallback((toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const normalizedMessage = normalizeMessage(message).trim();
    if (!normalizedMessage) return '';

    const toastId = `toast-${Date.now()}-${toastSequence++}`;
    const duration = options.duration ?? 4200;
    const variant = options.variant || 'info';

    setToasts((current) => ([
      ...current,
      {
        id: toastId,
        title: options.title ? normalizeMessage(options.title) : '',
        message: normalizedMessage,
        variant,
      },
    ]));

    window.setTimeout(() => dismissToast(toastId), duration);
    return toastId;
  }, [dismissToast]);

  const resolveConfirm = useCallback((result) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(result);
      confirmResolverRef.current = null;
    }

    setConfirmState((current) => ({ ...current, open: false }));
  }, []);

  const confirm = useCallback((message, options = {}) => {
    const normalizedMessage = normalizeMessage(message).trim();
    if (!normalizedMessage) return Promise.resolve(false);

    return new Promise((resolve) => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
      }

      confirmResolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: options.title ? normalizeMessage(options.title) : '',
        message: normalizedMessage,
        confirmLabel: options.confirmLabel || t('common.confirm'),
        cancelLabel: options.cancelLabel || t('common.cancel'),
        intent: options.intent || 'danger',
      });
    });
  }, [t]);

  useEffect(() => {
    const originalAlert = window.alert;
    const originalPrompt = window.prompt;

    window.alert = (message) => {
      showToast(message, { variant: 'info' });
    };

    window.prompt = (message) => {
      showToast(message, { variant: 'warning' });
      return null;
    };

    return () => {
      window.alert = originalAlert;
      window.prompt = originalPrompt;
    };
  }, [showToast]);

  useEffect(() => {
    if (!confirmState.open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        resolveConfirm(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmState.open, resolveConfirm]);

  useEffect(() => () => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
      confirmResolverRef.current = null;
    }
  }, []);

  const contextValue = useMemo(() => ({
    showToast,
    showSuccess: (message, options = {}) => showToast(message, { ...options, variant: 'success' }),
    showError: (message, options = {}) => showToast(message, { ...options, variant: 'error' }),
    showWarning: (message, options = {}) => showToast(message, { ...options, variant: 'warning' }),
    confirm,
  }), [confirm, showToast]);

  const confirmAccent = confirmState.intent === 'danger' ? '#9F4A4A' : '#5682B1';

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}

      <div style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 120,
        display: 'grid',
        gap: 10,
        width: 'min(360px, calc(100vw - 24px))',
        pointerEvents: 'none',
      }}>
        {toasts.map((toast) => {
          const accent = TOAST_ACCENTS[toast.variant] || TOAST_ACCENTS.info;
          const icon = TOAST_ICONS[toast.variant] || TOAST_ICONS.info;

          return (
            <div key={toast.id} style={{
              pointerEvents: 'auto',
              display: 'grid',
              gridTemplateColumns: '44px 1fr auto',
              alignItems: 'start',
              gap: 12,
              padding: '14px 14px 14px 12px',
              borderRadius: 18,
              background: 'linear-gradient(155deg, rgba(9,17,25,0.96) 0%, rgba(20,39,60,0.95) 100%)',
              border: `1px solid ${accent}55`,
              boxShadow: '0 18px 40px rgba(5,14,24,0.28)',
              color: '#FFFFFF',
            }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: `linear-gradient(135deg, ${accent} 0%, rgba(255,255,255,0.18) 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}>
                {icon}
              </div>

              <div>
                {toast.title ? (
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9FBDD9', marginBottom: 5 }}>
                    {toast.title}
                  </div>
                ) : null}
                <div style={{ fontSize: 13, lineHeight: 1.45, color: '#F6FAFE', whiteSpace: 'pre-wrap' }}>
                  {toast.message}
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#9FBDD9',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 2,
                }}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {confirmState.open ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 140, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div
            onClick={() => resolveConfirm(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(4, 10, 18, 0.56)', backdropFilter: 'blur(6px)' }}
          />

          <div style={{
            position: 'relative',
            width: 'min(460px, calc(100vw - 32px))',
            borderRadius: 24,
            padding: '24px 24px 20px',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F8FD 100%)',
            border: '1px solid rgba(115,158,201,0.36)',
            boxShadow: '0 28px 70px rgba(12, 28, 43, 0.24)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${confirmAccent} 0%, #739EC9 100%)`,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
              }}>
                !
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#739EC9', marginBottom: 4 }}>
                  FitCoach
                </div>
                <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.2, color: '#000000' }}>
                  {confirmState.title || confirmState.message}
                </h2>
              </div>
            </div>

            {confirmState.title ? (
              <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: '#3A4F63', whiteSpace: 'pre-wrap' }}>
                {confirmState.message}
              </p>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                style={{
                  minWidth: 112,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: '1px solid #9FBDD9',
                  background: '#FFFFFF',
                  color: '#2C4F73',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                style={{
                  minWidth: 132,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: `linear-gradient(135deg, ${confirmAccent} 0%, #C97D7D 100%)`,
                  color: '#FFFFFF',
                  fontWeight: 700,
                  boxShadow: '0 10px 22px rgba(159,74,74,0.22)',
                  cursor: 'pointer',
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error('useAppFeedback must be used within a FeedbackProvider');
  }

  return context;
}