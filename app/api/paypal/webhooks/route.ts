import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal/client";
import { PayPalApiError } from "@/lib/paypal/errors";
import { paypalErrorResponse } from "@/lib/paypal/route";
import type {
  PayPalWebhookEvent,
  PayPalWebhookRecord,
} from "@/lib/paypal/types";

const MAX_RECORDED_EVENTS = 200;

interface WebhookRegistry {
  records: Map<string, PayPalWebhookRecord>;
}

const webhookGlobal = globalThis as typeof globalThis & {
  __contractCompilerPayPalWebhooks?: WebhookRegistry;
};

function registry(): WebhookRegistry {
  if (!webhookGlobal.__contractCompilerPayPalWebhooks) {
    webhookGlobal.__contractCompilerPayPalWebhooks = {
      records: new Map<string, PayPalWebhookRecord>(),
    };
  }
  return webhookGlobal.__contractCompilerPayPalWebhooks;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function summarizeEvent(event: PayPalWebhookEvent): PayPalWebhookRecord {
  const resource =
    event.resource && typeof event.resource === "object"
      ? event.resource
      : undefined;

  return {
    id: event.id,
    eventType: event.event_type,
    receivedAt: new Date().toISOString(),
    resourceId: asOptionalString(resource?.id),
    resourceStatus: asOptionalString(resource?.status),
    summary: event.summary,
  };
}

function rememberEvent(record: PayPalWebhookRecord): void {
  const records = registry().records;
  records.set(record.id, record);

  while (records.size > MAX_RECORDED_EVENTS) {
    const oldestId = records.keys().next().value as string | undefined;
    if (!oldestId) break;
    records.delete(oldestId);
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const records = Array.from(registry().records.values()).reverse();
  return NextResponse.json(
    {
      configured: Boolean(process.env.PAYPAL_WEBHOOK_ID?.trim()),
      events: records,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      throw new PayPalApiError("Webhook body must contain valid JSON.", {
        status: 400,
        code: "INVALID_WEBHOOK",
      });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PayPalApiError("Webhook body must be a JSON object.", {
        status: 400,
        code: "INVALID_WEBHOOK",
      });
    }

    const event = payload as PayPalWebhookEvent;
    if (
      typeof event.id !== "string" ||
      !event.id ||
      typeof event.event_type !== "string" ||
      !event.event_type
    ) {
      throw new PayPalApiError(
        "Webhook event must include id and event_type.",
        { status: 400, code: "INVALID_WEBHOOK" },
      );
    }

    const verified = await verifyWebhookSignature(request.headers, event);
    if (!verified) {
      throw new PayPalApiError("PayPal webhook signature verification failed.", {
        status: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
      });
    }

    const records = registry().records;
    if (records.has(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const record = summarizeEvent(event);
    rememberEvent(record);

    return NextResponse.json({
      received: true,
      duplicate: false,
      event: record,
    });
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
