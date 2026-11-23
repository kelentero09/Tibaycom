'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };
type Props = { siteKey: string; onToken: (token: string | null) => void; ref?: Ref<TurnstileHandle> };

/** Cloudflare Turnstile widget. Tokens are single-use: call `reset()` after every submission attempt. */
export function Turnstile({ siteKey, onToken, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      callback.current(null);
      window.turnstile?.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-[65px]" aria-label="Bot verification" />;
}
