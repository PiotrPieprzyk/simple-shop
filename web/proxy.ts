import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig, isLambda } from "@/lib/config";

// The Lambda function URL is public (CloudFront can't sign POSTs from browsers
// or PayU, see ROADMAP.md, Milestone 2). CloudFront adds a secret
// x-origin-verify header; requests without it bypassed CloudFront and are
// rejected. Locally there is no CloudFront, so nothing is checked.
export async function proxy(request: NextRequest) {
  if (!isLambda()) {
    return NextResponse.next();
  }

  let secret: string | undefined;
  try {
    secret = (await getConfig()).originVerifySecret;
  } catch (error) {
    console.error("Failed to load config in proxy:", error);
    return new NextResponse("Service unavailable", { status: 503 });
  }

  if (!secret || !matches(request.headers.get("x-origin-verify"), secret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

// Constant time, so the response time doesn't reveal how much of the value matched.
function matches(received: string | null, expected: string): boolean {
  if (received === null) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
