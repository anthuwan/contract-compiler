import { NextResponse } from "next/server";
import { PayPalApiError, PayPalConfigurationError } from "./errors";

export function paypalErrorResponse(error: unknown): NextResponse {
  if (error instanceof PayPalConfigurationError) {
    return NextResponse.json(
      {
        error: "PAYPAL_NOT_CONFIGURED",
        message: error.message,
      },
      { status: 503 },
    );
  }

  if (error instanceof PayPalApiError) {
    const status =
      error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json(
      {
        error: error.code ?? "PAYPAL_API_ERROR",
        message: error.message,
        debugId: error.debugId,
        details: error.details,
      },
      { status },
    );
  }

  console.error("Unexpected PayPal route error", error);
  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message: "The PayPal request could not be completed.",
    },
    { status: 500 },
  );
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new PayPalApiError("Request body must contain valid JSON.", {
      status: 400,
      code: "INVALID_JSON",
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayPalApiError("Request body must be a JSON object.", {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }

  return payload as Record<string, unknown>;
}

export function requiredRouteId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new PayPalApiError(`${label} is invalid.`, {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }

  return normalized;
}

export function optionalString(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new PayPalApiError(`${key} must be a string.`, {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new PayPalApiError(`${key} must be 1-${maxLength} characters.`, {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }
  return normalized;
}

export function parseMoney(
  value: unknown,
  currency: unknown,
  options: { optional?: boolean } = {},
): { value: string; currencyCode: string } | undefined {
  if (options.optional && value === undefined && currency === undefined) {
    return undefined;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    throw new PayPalApiError("amount.value must be a decimal value.", {
      status: 400,
      code: "INVALID_AMOUNT",
    });
  }

  const normalizedValue = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(normalizedValue)) {
    throw new PayPalApiError(
      "amount.value must be positive with at most two decimal places.",
      { status: 400, code: "INVALID_AMOUNT" },
    );
  }

  const numericValue = Number(normalizedValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new PayPalApiError("amount.value must be greater than zero.", {
      status: 400,
      code: "INVALID_AMOUNT",
    });
  }

  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
    throw new PayPalApiError(
      "amount.currencyCode must be a three-letter currency code.",
      { status: 400, code: "INVALID_CURRENCY" },
    );
  }

  return {
    value: normalizedValue,
    currencyCode: currency.trim().toUpperCase(),
  };
}

export function requestIdFrom(request: Request): string | undefined {
  return (
    request.headers.get("paypal-request-id") ??
    request.headers.get("idempotency-key") ??
    undefined
  );
}
