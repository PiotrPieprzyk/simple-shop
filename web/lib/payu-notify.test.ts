import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { PayuOrder } from "./payu";
import { handleNotification, parseSignatureHeader, verifySignature } from "./payu-notify";

// A COMPLETED notification as PayU sends it, signed with the second_key of
// PayU's public sandbox test POS 300746.
const BODY = readFileSync(new URL("../test/fixtures/notification-completed.json", import.meta.url), "utf8");
const SECOND_KEY = "b6ca15b0d1020e8094d9b5f8d163db54";
const MD5_HEADER =
  "sender=checkout;signature=6ec47ab0685b8bd640e6c3f5c6c37e80;algorithm=MD5;content=DOCUMENT";
const SHA256_HEADER =
  "sender=checkout;signature=222ad5523b80a24206c775c02a9e4788783456e2dfbf0fb12b5caa877f708d94;algorithm=SHA-256;content=DOCUMENT";

const ORDER: PayuOrder = {
  orderId: "LDLW5N7MF4140324GUEST000P01",
  extOrderId: "6c1b5c8e-3f0a-4d8b-9b52-2f1d8e0c7a11",
  status: "COMPLETED",
  totalAmount: "1000",
  currencyCode: "PLN",
};

function deps(order: Partial<PayuOrder> = {}) {
  return {
    secondKey: SECOND_KEY,
    getOrder: vi.fn(async () => ({ ...ORDER, ...order })),
    seen: new Set<string>(),
    log: vi.fn(),
  };
}

const logged = (log: ReturnType<typeof vi.fn>) => log.mock.calls.map(([message]) => message).join("\n");

describe("parseSignatureHeader", () => {
  it("reads signature and algorithm", () => {
    expect(parseSignatureHeader(MD5_HEADER)).toEqual({
      signature: "6ec47ab0685b8bd640e6c3f5c6c37e80",
      algorithm: "MD5",
    });
  });

  it("returns undefined for a missing or incomplete header", () => {
    expect(parseSignatureHeader(null)).toBeUndefined();
    expect(parseSignatureHeader("sender=checkout;algorithm=MD5")).toBeUndefined();
  });
});

describe("verifySignature", () => {
  it("accepts the recorded MD5 and SHA-256 signatures", () => {
    expect(verifySignature(BODY, MD5_HEADER, SECOND_KEY)).toBe(true);
    expect(verifySignature(BODY, SHA256_HEADER, SECOND_KEY)).toBe(true);
  });

  it("rejects a changed body", () => {
    const changed = BODY.replace('"totalAmount":"1000"', '"totalAmount":"1"');
    expect(changed).not.toBe(BODY);
    expect(verifySignature(changed, MD5_HEADER, SECOND_KEY)).toBe(false);
  });

  it("rejects a wrong key, an unknown algorithm and a missing header", () => {
    expect(verifySignature(BODY, MD5_HEADER, "wrong")).toBe(false);
    expect(verifySignature(BODY, MD5_HEADER.replace("MD5", "SHA-1"), SECOND_KEY)).toBe(false);
    expect(verifySignature(BODY, null, SECOND_KEY)).toBe(false);
  });
});

describe("handleNotification", () => {
  it("verifies a notification and checks the order with PayU", async () => {
    const d = deps();
    expect(await handleNotification(BODY, MD5_HEADER, d)).toEqual({ status: 200 });
    expect(d.getOrder).toHaveBeenCalledWith("LDLW5N7MF4140324GUEST000P01");
    expect(logged(d.log)).toContain("verified: order LDLW5N7MF4140324GUEST000P01");
    expect(logged(d.log)).toContain("COMPLETED");
  });

  it("handles a repeated notification once", async () => {
    const d = deps();
    await handleNotification(BODY, MD5_HEADER, d);
    expect(await handleNotification(BODY, MD5_HEADER, d)).toEqual({ status: 200 });
    expect(d.getOrder).toHaveBeenCalledTimes(1);
    expect(logged(d.log)).toContain("duplicate");
  });

  it("rejects a changed body with 400", async () => {
    const d = deps();
    const changed = BODY.replace("COMPLETED", "CANCELED");
    expect(await handleNotification(changed, MD5_HEADER, d)).toEqual({ status: 400 });
    expect(d.getOrder).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 400", async () => {
    expect(await handleNotification(BODY, null, deps())).toEqual({ status: 400 });
  });

  it("trusts PayU's order status over the notification body", async () => {
    const d = deps({ status: "PENDING" });
    expect(await handleNotification(BODY, MD5_HEADER, d)).toEqual({ status: 200 });
    expect(logged(d.log)).toContain("Using PENDING");
    expect(d.seen.has("LDLW5N7MF4140324GUEST000P01:PENDING")).toBe(true);
    expect(d.seen.has("LDLW5N7MF4140324GUEST000P01:COMPLETED")).toBe(false);
  });

  it("answers 500 when PayU can't be reached, so PayU retries", async () => {
    const d = deps();
    d.getOrder.mockRejectedValueOnce(new Error("timeout"));
    expect(await handleNotification(BODY, MD5_HEADER, d)).toEqual({ status: 500 });
    expect(d.seen.size).toBe(0);
    // The retry is processed normally.
    expect(await handleNotification(BODY, MD5_HEADER, d)).toEqual({ status: 200 });
    expect(d.seen.size).toBe(1);
  });
});
