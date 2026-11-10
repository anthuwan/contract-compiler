import { NextResponse } from "next/server";
import {
  getPayPalClientId,
  getPayPalEnvironment,
} from "@/lib/paypal/client";
import { paypalErrorResponse } from "@/lib/paypal/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const environment = getPayPalEnvironment();
    return NextResponse.json(
      {
        clientId: getPayPalClientId(),
        environment,
        currency: process.env.PAYPAL_CURRENCY?.trim().toUpperCase() || "USD",
        intent: "authorize",
        webSdkUrl:
          environment === "sandbox"
            ? "https://www.sandbox.paypal.com/web-sdk/v6/core"
            : "https://www.paypal.com/web-sdk/v6/core",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
