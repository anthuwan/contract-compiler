"use client";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PayPalAuthorizationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "starting"
  | "authorizing"
  | "authorized"
  | "cancelled"
  | "error";

type PayPalConfig = {
  clientId: string;
  currency: string;
  environment: "sandbox" | "live";
  intent: "authorize";
  webSdkUrl: string;
};

type PayPalSession = {
  start(
    options: { presentationMode: "auto" },
    order: Promise<{ orderId: string }>,
  ): Promise<void>;
};

type PayPalSdkInstance = {
  findEligibleMethods(options: {
    currencyCode: string;
  }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(options: {
    onApprove(input: { orderId: string }): Promise<unknown>;
    onCancel(): void;
    onError(error: unknown): void;
  }): PayPalSession;
};

declare global {
  interface Window {
    paypal?: {
      createInstance(options: {
        clientId: string;
        components: string[];
        pageType: "checkout";
        clientMetadataId?: string;
      }): Promise<PayPalSdkInstance>;
    };
  }
}

type Props = {
  enabled: boolean;
  amount: string;
  currency: string;
  description: string;
  referenceId: string;
  onAuthorized?: (result: {
    orderId: string;
    authorizationId: string;
  }) => void;
  onStatus?: (status: PayPalAuthorizationStatus, message: string) => void;
};

let sdkLoadPromise: Promise<void> | null = null;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "The PayPal Sandbox request could not be completed.";
}

async function responseJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function loadPayPalSdk(src: string) {
  if (window.paypal?.createInstance) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-contract-compiler-paypal-sdk]",
    );
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.paypal?.createInstance) resolve();
      else reject(new Error("PayPal Web SDK loaded without createInstance."));
    };
    const handleError = () =>
      reject(new Error("PayPal Web SDK v6 could not be loaded."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.contractCompilerPaypalSdk = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}

export function PayPalV6Authorization({
  enabled,
  amount,
  currency,
  description,
  referenceId,
  onAuthorized,
  onStatus,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onAuthorized, onStatus });
  const [status, setStatus] = useState<PayPalAuthorizationStatus>("idle");
  const [message, setMessage] = useState(
    "Approve the corrected transaction plan to continue.",
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onAuthorized, onStatus };
  }, [onAuthorized, onStatus]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const mountNode = mount;
    mountNode.replaceChildren();

    let disposed = false;
    let button: HTMLElement | null = null;
    let clickHandler: (() => Promise<void>) | null = null;

    function update(
      nextStatus: PayPalAuthorizationStatus,
      nextMessage: string,
    ) {
      if (disposed) return;
      setStatus(nextStatus);
      setMessage(nextMessage);
      callbacksRef.current.onStatus?.(nextStatus, nextMessage);
    }

    if (!enabled) {
      update("idle", "Approve the corrected transaction plan to continue.");
      return;
    }

    const controller = new AbortController();

    async function initialize() {
      update("loading", "Connecting to PayPal Sandbox…");
      try {
        const configResponse = await fetch("/api/paypal/config", {
          cache: "no-store",
          signal: controller.signal,
        });
        const config = (await responseJson(configResponse)) as PayPalConfig;

        await loadPayPalSdk(config.webSdkUrl);
        if (disposed || !window.paypal?.createInstance) return;

        const sdk = await window.paypal.createInstance({
          clientId: config.clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
          clientMetadataId: crypto.randomUUID(),
        });
        const methods = await sdk.findEligibleMethods({
          currencyCode: currency || config.currency,
        });
        if (!methods.isEligible("paypal")) {
          throw new Error(
            "PayPal is not eligible for this Sandbox buyer configuration.",
          );
        }

        const session = sdk.createPayPalOneTimePaymentSession({
          async onApprove({ orderId }) {
            update("authorizing", "Buyer approved. Authorizing the order…");
            const response = await fetch(
              `/api/paypal/orders/${encodeURIComponent(orderId)}/authorize`,
              {
                method: "POST",
                headers: {
                  "Idempotency-Key": `authorize-${orderId}`,
                },
              },
            );
            const payload = await responseJson(response);
            const authorization = payload.authorization as
              | { id?: unknown }
              | undefined;
            if (typeof authorization?.id !== "string") {
              throw new Error(
                "PayPal approved the order but returned no authorization ID.",
              );
            }
            update("authorized", "PayPal authorization completed.");
            callbacksRef.current.onAuthorized?.({
              orderId,
              authorizationId: authorization.id,
            });
            return payload;
          },
          onCancel() {
            update("cancelled", "The buyer cancelled PayPal authorization.");
          },
          onError(error) {
            update("error", errorMessage(error));
          },
        });

        button = document.createElement("paypal-button");
        button.id = "paypal-authorize-button";
        button.dataset.testid = "paypal-authorize-button";
        button.setAttribute("type", "pay");
        button.setAttribute("aria-label", "Authorize with PayPal Sandbox");
        button.style.display = "block";
        button.style.width = "100%";

        clickHandler = async () => {
          update("starting", "Opening PayPal Sandbox approval…");
          try {
            const orderPromise = fetch("/api/paypal/orders", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": `order-${referenceId}`,
              },
              body: JSON.stringify({
                amount: { value: amount, currencyCode: currency },
                description,
                referenceId,
                customId: referenceId,
              }),
            })
              .then(responseJson)
              .then((payload) => {
                const order = payload.order as { id?: unknown } | undefined;
                if (typeof order?.id !== "string") {
                  throw new Error("PayPal returned no order ID.");
                }
                return { orderId: order.id };
              });

            await session.start({ presentationMode: "auto" }, orderPromise);
          } catch (error) {
            update("error", errorMessage(error));
          }
        };

        button.addEventListener("click", clickHandler);
        mountNode.replaceChildren(button);
        update("ready", "PayPal Sandbox is ready for buyer approval.");
      } catch (error) {
        if (controller.signal.aborted) return;
        update("error", errorMessage(error));
      }
    }

    void initialize();

    return () => {
      disposed = true;
      controller.abort();
      if (button && clickHandler) {
        button.removeEventListener("click", clickHandler);
      }
      mountNode.replaceChildren();
    };
  }, [amount, currency, description, enabled, referenceId, retry]);

  if (!enabled) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-300 px-4 text-sm font-bold text-white"
        >
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          Authorize with PayPal
        </button>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={mountRef}
        id="paypal-sdk-mount"
        data-testid="paypal-sdk-mount"
        className="min-h-12"
      >
        {status === "loading" || status === "starting" || status === "authorizing" ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            {status === "authorizing" ? "Authorizing" : "Connecting"}
          </div>
        ) : null}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`mt-3 flex items-start justify-center gap-1.5 text-center text-[11px] font-semibold ${
          status === "error"
            ? "text-rose-700"
            : status === "authorized"
              ? "text-emerald-700"
              : "text-slate-500"
        }`}
      >
        {status === "error" ? (
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : status === "authorized" ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : status !== "ready" ? (
          <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : null}
        <span>{message}</span>
      </div>

      {status === "error" ? (
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry connection
        </button>
      ) : null}
    </div>
  );
}

