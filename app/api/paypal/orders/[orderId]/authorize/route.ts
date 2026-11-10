import { NextResponse } from "next/server";
import { authorizeOrder } from "@/lib/paypal/client";
import {
  paypalErrorResponse,
  requestIdFrom,
  requiredRouteId,
} from "@/lib/paypal/route";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const order = await authorizeOrder(
      requiredRouteId(orderId, "orderId"),
      requestIdFrom(request),
    );
    const authorization =
      order.purchase_units?.[0]?.payments?.authorizations?.[0];

    return NextResponse.json({ order, authorization });
  } catch (error) {
    return paypalErrorResponse(error);
  }
}
