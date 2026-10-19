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
      {/* Starts a PayU payment from Milestone 3 on. */}
      <button type="button" className={styles.button}>
        Buy
      </button>
    </main>
  );
}
