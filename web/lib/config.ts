import "server-only";

export type Config = {
  sanityProjectId: string;
  sanityDataset: string;
  sanityApiReadToken: string;
};

export class ConfigError extends Error {
  name = "ConfigError";
}

// Locally this reads process.env (web/.env.local). In Lambda (Milestone 2) it
// will read SSM parameters once per instance, so it is async from the start.
export async function getConfig(): Promise<Config> {
  return {
    sanityProjectId: required("SANITY_PROJECT_ID"),
    sanityDataset: required("SANITY_DATASET"),
    sanityApiReadToken: required("SANITY_API_READ_TOKEN"),
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigError(`${name} is not set. Add it to web/.env.local.`);
  }
  return value;
}
