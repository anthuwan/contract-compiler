import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal/client";
import { PayPalApiError } from "@/lib/paypal/errors";
import {
  optionalString,
  parseMoney,
  paypalErrorResponse,
  readJsonObject,
  requestIdFrom,
  requiredRouteId,
} from "@/lib/paypal/route";

interface RouteContext {
  params: Promise<{ authorizationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const payload = await readJsonObject(request);
    const amountPayload = payload.amount;
    let amount:
      | { value: string; currencyCode: string }
      | undefined;

    if (amountPayload !== undefined) {
      if (
        !amountPayload ||
        typeof amountPayload !== "object" ||
        Array.isArray(amountPayload)
      ) {
        throw new PayPalApiError("amount must be a JSON object.", {
          status: 400,
          code: "INVALID_AMOUNT",
        });
      }
      const amountRecord = amountPayload as Record<string, unknown>;
      amount = parseMoney(
        amountRecord.value,
        amountRecord.currencyCode ?? amountRecord.currency_code,
      );
    }

    if (
      payload.finalCapture !== undefined &&
      typeof payload.finalCapture !== "boolean"
    ) {
      throw new PayPalApiError("finalCapture must be a boolean.", {
        status: 400,
        code: "INVALID_REQUEST",
      });
    }

    const { authorizationId } = await context.params;
    const capture = await captureAuthorization(
      requiredRouteId(authorizationId, "authorizationId"),
      {
        amount,
        finalCapture:
          typeof payload.finalCapture === "boolean"
            ? payload.finalCapture
            : true,
        invoiceId: optionalString(payload, "invoiceId", 127),
        noteToPayer: optionalString(payload, "noteToPayer", 255),
      },
      requestIdFrom(request),
    );

    return NextResponse.json({ capture });
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
