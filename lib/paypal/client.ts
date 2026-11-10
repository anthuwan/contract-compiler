import {
  PayPalApiError,
  PayPalConfigurationError,
} from "./errors";
import type {
  CaptureAuthorizationInput,
  CreateAuthorizeOrderInput,
  PayPalEnvironment,
  PayPalOrder,
  PayPalWebhookEvent,
} from "./types";

const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_API_BASE = "https://api-m.paypal.com";
const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60_000;

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
}

let cachedAccessToken: CachedAccessToken | undefined;

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PayPalConfigurationError(
      `${name} is not configured on the server.`,
    );
  }

  return value;
}

export function getPayPalEnvironment(): PayPalEnvironment {
  const configured = process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase();
  return configured === "live" || configured === "production"
    ? "live"
    : "sandbox";
}

export function getPayPalApiBase(): string {
  const configured = process.env.PAYPAL_API_BASE?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return getPayPalEnvironment() === "live"
    ? LIVE_API_BASE
    : SANDBOX_API_BASE;
}

export function getPayPalClientId(): string {
  return readRequiredEnvironmentVariable("PAYPAL_CLIENT_ID");
}

function getPayPalClientSecret(): string {
  return readRequiredEnvironmentVariable("PAYPAL_CLIENT_SECRET");
}

function encodeBasicCredentials(clientId: string, clientSecret: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(`${clientId}:${clientSecret}`);
  }

  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorField(
  payload: unknown,
  key: string,
): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

async function throwPayPalApiError(response: Response): Promise<never> {
  const payload = await readResponseBody(response);
  const code = errorField(payload, "name") ?? errorField(payload, "error");
  const message =
    errorField(payload, "message") ??
    errorField(payload, "error_description") ??
    `PayPal request failed with HTTP ${response.status}.`;

  throw new PayPalApiError(message, {
    status: response.status,
    code,
    debugId:
      errorField(payload, "debug_id") ??
      response.headers.get("paypal-debug-id") ??
      undefined,
    details: payload,
  });
}

export async function getPayPalAccessToken(): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const clientId = getPayPalClientId();
  const clientSecret = getPayPalClientSecret();
  const apiBase = getPayPalApiBase();
  const cacheKey = `${apiBase}:${clientId}`;
  const now = Date.now();

  if (
    cachedAccessToken?.cacheKey === cacheKey &&
    cachedAccessToken.expiresAt - TOKEN_EXPIRY_SAFETY_WINDOW_MS > now
  ) {
    return cachedAccessToken;
  }

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${encodeBasicCredentials(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!response.ok) {
    await throwPayPalApiError(response);
  }

  const payload = (await response.json()) as AccessTokenResponse;
  if (!payload.access_token || !payload.expires_in) {
    throw new PayPalApiError("PayPal returned an invalid OAuth response.", {
      status: 502,
      details: payload,
    });
  }

  cachedAccessToken = {
    accessToken: payload.access_token,
    expiresAt: now + payload.expires_in * 1_000,
    cacheKey,
  };

  return cachedAccessToken;
}

function sanitizeRequestId(requestId?: string): string {
  const candidate = requestId?.trim();
  if (candidate && /^[A-Za-z0-9_-]{1,38}$/.test(candidate)) {
    return candidate;
  }

  return crypto.randomUUID();
}

async function paypalRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { requestId?: string; idempotentWrite?: boolean } = {},
): Promise<T> {
  const { accessToken } = await getPayPalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options.idempotentWrite) {
    headers.set("PayPal-Request-Id", sanitizeRequestId(options.requestId));
  }

  const response = await fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    await throwPayPalApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await readResponseBody(response)) as T;
}

export async function createAuthorizeOrder(
  input: CreateAuthorizeOrderInput,
  requestId?: string,
): Promise<PayPalOrder> {
  const purchaseUnit: Record<string, unknown> = {
    reference_id: input.referenceId ?? "default",
    amount: {
      currency_code: input.amount.currencyCode,
      value: input.amount.value,
    },
  };

  if (input.description) purchaseUnit.description = input.description;
  if (input.customId) purchaseUnit.custom_id = input.customId;
  if (input.invoiceId) purchaseUnit.invoice_id = input.invoiceId;

  return paypalRequest<PayPalOrder>(
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "AUTHORIZE",
        purchase_units: [purchaseUnit],
      }),
    },
    { requestId, idempotentWrite: true },
  );
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  );
}

export async function authorizeOrder(
  orderId: string,
  requestId?: string,
): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    {
      method: "POST",
      body: "{}",
    },
    { requestId, idempotentWrite: true },
  );
}

export async function captureAuthorization(
  authorizationId: string,
  input: CaptureAuthorizationInput = {},
  requestId?: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};

  if (input.amount) {
    body.amount = {
      currency_code: input.amount.currencyCode,
      value: input.amount.value,
    };
  }
  if (input.finalCapture !== undefined) {
    body.final_capture = input.finalCapture;
  }
  if (input.invoiceId) body.invoice_id = input.invoiceId;
  if (input.noteToPayer) body.note_to_payer = input.noteToPayer;

  return paypalRequest<Record<string, unknown>>(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { requestId, idempotentWrite: true },
  );
}

export async function verifyWebhookSignature(
  headers: Headers,
  event: PayPalWebhookEvent,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    throw new PayPalConfigurationError(
      "PAYPAL_WEBHOOK_ID is not configured on the server.",
    );
  }

  const requiredHeaders = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };

  const missing = Object.entries(requiredHeaders)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new PayPalApiError(
      `Webhook is missing required PayPal signature fields: ${missing.join(", ")}.`,
      { status: 400 },
    );
  }

  const result = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        ...requiredHeaders,
        webhook_id: webhookId,
        webhook_event: event,
      }),
    },
  );

  return result.verification_status === "SUCCESS";
}
