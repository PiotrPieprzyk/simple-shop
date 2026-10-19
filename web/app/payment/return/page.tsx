import Link from "next/link";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

// PayU's continueUrl. Anyone can open this URL, so it never marks an order as
// paid: the payment state comes only from the notification (/api/payu/notify).
export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className={styles.main}>
      {error ? (
        <>
          <h1>Payment couldn&apos;t be started</h1>
          <p className={styles.error} role="alert">
            Something went wrong while contacting the payment provider. Please try again later.
          </p>
        </>
      ) : (
        <>
          <h1>Thank you</h1>
          <p>
            Your payment is in progress or done. We&apos;ll confirm it as soon as the payment
            provider tells us.
          </p>
        </>
      )}
      <Link href="/">Back to the shop</Link>
    </main>
  );
}
