"use client";

import { useEffect, useRef, useState } from "react";

interface PayPalButtonsInstance {
  render(el: HTMLElement): Promise<void>;
  close(): Promise<void>;
}
interface PayPalNamespace {
  Buttons(options: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }): PayPalButtonsInstance;
}
declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

const loaders = new Map<string, Promise<PayPalNamespace>>();

/** Load the PayPal JS SDK once per client id + currency, with intent=authorize (hold, don't take). */
function loadSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  const key = `${clientId}:${currency}`;
  let p = loaders.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=authorize&components=buttons`;
      s.async = true;
      s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK loaded without paypal object")));
      s.onerror = () => reject(new Error("Couldn't load PayPal"));
      document.head.appendChild(s);
    });
    loaders.set(key, p);
  }
  return p;
}

export function PayPalFundButton(props: {
  clientId: string;
  currency: string;
  createOrder: () => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef(props);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep the latest callbacks without re-rendering the PayPal buttons.
  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    let buttons: PayPalButtonsInstance | null = null;
    let cancelled = false;
    loadSdk(props.clientId, props.currency)
      .then((paypal) => {
        if (cancelled || !ref.current) return;
        buttons = paypal.Buttons({
          style: { layout: "horizontal", label: "pay", height: "40", tagline: "false" },
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data) => handlers.current.onApprove(data.orderID),
          onCancel: () => handlers.current.onCancel(),
          onError: (err) => handlers.current.onError(err instanceof Error ? err.message : "PayPal reported an error"),
        });
        return buttons.render(ref.current);
      })
      .catch((e: Error) => setLoadError(e.message));
    return () => {
      cancelled = true;
      buttons?.close().catch(() => undefined);
    };
  }, [props.clientId, props.currency]);

  if (loadError) return <p className="text-sm text-[#ffc2c2]">{loadError}</p>;
  return <div ref={ref} className="min-h-10 max-w-xs" />;
}
