import "server-only";

import { getConfig } from "./config";

// PayU REST API (https://developers.payu.com/europe/api/). Amounts are in the
// smallest currency unit: 1000 = 10.00 PLN.

export class PayuError extends Error {
  name = "PayuError";
}

export type PayuOrderStatus =
  | "NEW"
  | "PENDING"
  | "WAITING_FOR_CONFIRMATION"
  | "COMPLETED"
  | "CANCELED";

export type PayuOrder = {
  orderId: string;
  extOrderId?: string;
  status: PayuOrderStatus;
  totalAmount: string;
  currencyCode: string;
};

export type NewOrder = {
  extOrderId: string;
  customerIp: string;
  description: string;
  totalAmount: number;
  products: { name: string; unitPrice: number; quantity: number }[];
  buyer?: { email: string; firstName?: string; lastName?: string; language?: string };
};

// Below the Lambda timeout (15 s), so a slow PayU gives a clean error instead.
const TIMEOUT_MS = 10_000;
// Renew the token a bit before PayU says it expires.
const TOKEN_MARGIN_MS = 60_000;

let token: { value: string; expiresAt: number } | undefined;

/** OAuth client_credentials token, cached per Lambda instance until shortly before it expires. */
async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) {
    return token.value;
  }
  const config = await getConfig();
  const response = await fetch(`${config.payuBaseUrl}/pl/standard/user/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.payuClientId,
      client_secret: config.payuClientSecret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new PayuError(`OAuth failed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  token = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_MARGIN_MS,
  };
  return token.value;
}

async function authHeaders(): Promise<HeadersInit> {
  return { Authorization: `Bearer ${await getAccessToken()}` };
}

/**
 * Creates an order and returns the PayU page to send the buyer to. PayU answers
 * 302 with the redirectUri in the body, so redirects aren't followed.
 */
export async function createOrder(
  order: NewOrder,
): Promise<{ orderId: string; redirectUri: string }> {
  const config = await getConfig();
  const response = await fetch(`${config.payuBaseUrl}/api/v2_1/orders`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({
      notifyUrl: `${config.appUrl}/api/payu/notify`,
      continueUrl: `${config.appUrl}/payment/return`,
      merchantPosId: config.payuPosId,
      currencyCode: "PLN",
      ...order,
      totalAmount: String(order.totalAmount),
      products: order.products.map((p) => ({
        ...p,
        unitPrice: String(p.unitPrice),
        quantity: String(p.quantity),
      })),
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body: { status?: { statusCode?: string }; orderId?: string; redirectUri?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new PayuError(`Create order: HTTP ${response.status}, not JSON: ${text.slice(0, 500)}`);
  }
  if (body.status?.statusCode !== "SUCCESS" || !body.orderId || !body.redirectUri) {
    throw new PayuError(`Create order: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return { orderId: body.orderId, redirectUri: body.redirectUri };
}

/** The order as PayU has it now. Used to check a notification against PayU itself. */
export async function getOrder(orderId: string): Promise<PayuOrder> {
  const config = await getConfig();
  const response = await fetch(
    `${config.payuBaseUrl}/api/v2_1/orders/${encodeURIComponent(orderId)}`,
    { headers: await authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new PayuError(`Get order ${orderId}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { orders?: PayuOrder[] };
  const order = body.orders?.[0];
  if (!order) {
    throw new PayuError(`Get order ${orderId}: no order in the response`);
  }
  return order;
}
