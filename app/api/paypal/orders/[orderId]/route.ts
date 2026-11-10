import { NextResponse } from "next/server";
import { getOrder } from "@/lib/paypal/client";
import { paypalErrorResponse, requiredRouteId } from "@/lib/paypal/route";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const order = await getOrder(requiredRouteId(orderId, "orderId"));
    return NextResponse.json({ order });
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
