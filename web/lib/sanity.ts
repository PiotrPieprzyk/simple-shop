import "server-only";

import { createClient, type SanityClient } from "@sanity/client";
import { defineQuery } from "groq";
import type { HOME_PAGE_QUERY_RESULT } from "@/sanity.types";
import { getConfig } from "./config";

// Fixed date, so Sanity API behaviour doesn't change under us.
const API_VERSION = "2026-10-01";

// Result types come from TypeGen: run `npm run typegen` in studio/ after
// changing a query or the schema.
const HOME_PAGE_QUERY = defineQuery(
  `*[_type == "homePage" && _id == "homePage"][0]{title, paragraph}`,
);

export type HomePage = NonNullable<HOME_PAGE_QUERY_RESULT>;

export class ContentError extends Error {
  name = "ContentError";
}

async function getClient(): Promise<SanityClient> {
  const config = await getConfig();
  return createClient({
    projectId: config.sanityProjectId,
    dataset: config.sanityDataset,
    token: config.sanityApiReadToken,
    apiVersion: API_VERSION,
    useCdn: false,
    perspective: "published",
  });
}

export async function getHomePage(): Promise<HomePage> {
  const client = await getClient();
  const homePage = await client.fetch(HOME_PAGE_QUERY);
  // The dataset is private: without a valid token, Sanity returns no documents.
  if (!homePage) {
    throw new ContentError(
      "No published homePage document found. Check that SANITY_API_READ_TOKEN is valid and that the document is published in the Studio.",
    );
  }
  return homePage;
}
