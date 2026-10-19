import { getConfig } from "@/lib/config";
import { getOrder } from "@/lib/payu";
import { handleNotification } from "@/lib/payu-notify";

// Handled notifications of this Lambda instance (see NotificationDeps.seen).
const seen = new Set<string>();

// PayU's order status notifications. The payment state comes only from here,
// never from the return page.
export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw body.
  const rawBody = await request.text();
  const { payuSecondKey } = await getConfig();
  const { status } = await handleNotification(
    rawBody,
    request.headers.get("openpayu-signature"),
    { secondKey: payuSecondKey, getOrder, seen, log: console.log },
  );
  return new Response(null, { status });
}
