import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { createOrder } from "@/lib/payu";
import { TEST_PRODUCT } from "@/lib/product";

// Called by the Buy button's form. Creates a PayU order and sends the browser
// to PayU's payment page.
export async function POST(request: NextRequest) {
  // The amount and products are set here; nothing from the request body is used.
  const extOrderId = randomUUID();
  try {
    const { orderId, redirectUri } = await createOrder({
      extOrderId,
      customerIp: customerIp(request),
      description: TEST_PRODUCT.name,
      totalAmount: TEST_PRODUCT.price,
      products: [{ name: TEST_PRODUCT.name, unitPrice: TEST_PRODUCT.price, quantity: 1 }],
      // A test buyer until the email field arrives in Milestone 5.
      buyer: { email: "buyer@example.com", firstName: "Test", lastName: "Buyer", language: "pl" },
    });
    console.log(`Checkout: created PayU order ${orderId} (extOrderId ${extOrderId})`);
    // 303, so the browser follows the form POST with a GET.
    return NextResponse.redirect(redirectUri, 303);
  } catch (error) {
    console.error(`Checkout failed (extOrderId ${extOrderId}):`, error);
    const { appUrl } = await getConfig();
    return NextResponse.redirect(`${appUrl}/payment/return?error=1`, 303);
  }
}

// CloudFront puts the viewer's address first in x-forwarded-for.
function customerIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
}
