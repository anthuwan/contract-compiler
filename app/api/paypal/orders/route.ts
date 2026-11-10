import { NextResponse } from "next/server";
import { createAuthorizeOrder } from "@/lib/paypal/client";
import { PayPalApiError } from "@/lib/paypal/errors";
import {
  optionalString,
  parseMoney,
  paypalErrorResponse,
  readJsonObject,
  requestIdFrom,
} from "@/lib/paypal/route";

export async function POST(request: Request) {
  try {
    const payload = await readJsonObject(request);
    const amountPayload = payload.amount;
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
    const amount = parseMoney(
      amountRecord.value,
      amountRecord.currencyCode ?? amountRecord.currency_code,
    );
    if (!amount) {
      throw new PayPalApiError("amount is required.", {
        status: 400,
        code: "INVALID_AMOUNT",
      });
    }

    const order = await createAuthorizeOrder(
      {
        amount,
        description: optionalString(payload, "description", 127),
        referenceId: optionalString(payload, "referenceId", 256),
        customId: optionalString(payload, "customId", 127),
        invoiceId: optionalString(payload, "invoiceId", 127),
      },
      requestIdFrom(request),
    );

    return NextResponse.json(
      {
        order,
        approvalUrl: order.links?.find((link) => link.rel === "approve")?.href,
      },
      { status: 201 },
    );
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
