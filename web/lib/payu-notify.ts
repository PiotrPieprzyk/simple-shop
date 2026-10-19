import { createHash, timingSafeEqual } from "node:crypto";
import type { PayuOrder } from "./payu";

// PayU order notifications (POST /api/payu/notify). No server-only import and
// no config access, so the unit tests can call this directly.

const ALGORITHMS = { MD5: "md5", "SHA-256": "sha256", SHA256: "sha256" } as const;

/** Parses `sender=checkout;signature=…;algorithm=MD5;content=DOCUMENT`. */
export function parseSignatureHeader(
  header: string | null,
): { signature: string; algorithm: string } | undefined {
  if (!header) {
    return undefined;
  }
  const fields = new Map(
    header.split(";").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim().toLowerCase(), value.join("=").trim()] as const;
    }),
  );
  const signature = fields.get("signature");
  const algorithm = fields.get("algorithm");
  return signature && algorithm ? { signature, algorithm } : undefined;
}

/**
 * The signature is hex(hash(rawBody + secondKey)). It covers the exact bytes
 * PayU sent, so this needs the raw body, not re-serialized JSON.
 */
export function verifySignature(rawBody: string, header: string | null, secondKey: string): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return false;
  }
  const algorithm = ALGORITHMS[parsed.algorithm.toUpperCase() as keyof typeof ALGORITHMS];
  if (!algorithm) {
    return false;
  }
  const expected = createHash(algorithm).update(rawBody + secondKey).digest("hex");
  // Constant time, so the response time doesn't reveal how much of the value matched.
  const a = Buffer.from(parsed.signature.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type NotificationDeps = {
  secondKey: string;
  getOrder: (orderId: string) => Promise<PayuOrder>;
  // Keys `orderId:status` of handled notifications. In memory per Lambda
  // instance for now; Milestone 4 replaces it with the DynamoDB orders table.
  seen: Set<string>;
  log: (message: string) => void;
};

export async function handleNotification(
  rawBody: string,
  signatureHeader: string | null,
  deps: NotificationDeps,
): Promise<{ status: 200 | 400 | 500 }> {
  if (!verifySignature(rawBody, signatureHeader, deps.secondKey)) {
    deps.log("PayU notification rejected: bad or missing signature");
    return { status: 400 };
  }

  let orderId: unknown;
  let notifiedStatus: unknown;
  try {
    ({ orderId, status: notifiedStatus } = JSON.parse(rawBody).order ?? {});
  } catch {
    deps.log("PayU notification rejected: body isn't JSON");
    return { status: 400 };
  }
  if (typeof orderId !== "string" || typeof notifiedStatus !== "string") {
    deps.log("PayU notification rejected: no order.orderId or order.status");
    return { status: 400 };
  }

  // PayU retries until it gets a 200, so the same notification can arrive more than once.
  if (deps.seen.has(`${orderId}:${notifiedStatus}`)) {
    deps.log(`PayU notification duplicate: order ${orderId} ${notifiedStatus}, already handled`);
    return { status: 200 };
  }

  // Trust PayU's own record of the order, not only the notification body.
  let order: PayuOrder;
  try {
    order = await deps.getOrder(orderId);
  } catch (error) {
    // 500 makes PayU retry later.
    deps.log(`PayU notification for order ${orderId}: fetching the order failed: ${error}`);
    return { status: 500 };
  }
  if (order.status !== notifiedStatus) {
    deps.log(
      `PayU notification for order ${orderId} says ${notifiedStatus}, PayU has ${order.status}. Using ${order.status}.`,
    );
  }

  const key = `${orderId}:${order.status}`;
  if (deps.seen.has(key)) {
    deps.log(`PayU notification duplicate: order ${orderId} ${order.status}, already handled`);
    return { status: 200 };
  }
  deps.seen.add(key);
  deps.log(
    `PayU notification verified: order ${orderId} (extOrderId ${order.extOrderId}) ${order.status}, ${order.totalAmount} ${order.currencyCode}`,
  );
  return { status: 200 };
}
