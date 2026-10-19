import { formatPrice, TEST_PRODUCT } from "@/lib/product";
import { getHomePage, type HomePage } from "@/lib/sanity";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  let homePage: HomePage;
  try {
    homePage = await getHomePage();
  } catch (error) {
    console.error("Failed to load home page content:", error);
    return (
      <main className={styles.main}>
        <h1>Content unavailable</h1>
        <p className={styles.error} role="alert">
          {process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : "The shop content couldn't be loaded. Please try again later."}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <h1>{homePage.title}</h1>
      <p>{homePage.paragraph}</p>
      {/* A plain form POST: /api/checkout redirects to PayU's payment page. */}
      <form method="post" action="/api/checkout">
        <p>
          {TEST_PRODUCT.name}: {formatPrice(TEST_PRODUCT.price)}
        </p>
        <button type="submit" className={styles.button}>
          Buy
        </button>
      </form>
    </main>
  );
}
