import { NextResponse } from "next/server";
import {
  getPayPalAccessToken,
  getPayPalApiBase,
  getPayPalEnvironment,
} from "@/lib/paypal/client";
import { paypalErrorResponse } from "@/lib/paypal/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await getPayPalAccessToken();
    return NextResponse.json(
      {
        ok: true,
        environment: getPayPalEnvironment(),
        apiBase: getPayPalApiBase(),
        tokenExpiresAt: new Date(token.expiresAt).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
