import "server-only";

import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

export type Config = {
  sanityProjectId: string;
  sanityDataset: string;
  sanityApiReadToken: string;
  // Value of the x-origin-verify header CloudFront adds. Set only in Lambda.
  originVerifySecret?: string;
};

export class ConfigError extends Error {
  name = "ConfigError";
}

// In Lambda, SSM_PREFIX (e.g. /simple-shop) is the only setting in the
// environment: the values live in SSM Parameter Store and are read once per
// instance. Locally, process.env (web/.env.local) is used.
let cached: Promise<Config> | undefined;

export function getConfig(): Promise<Config> {
  const ssmPrefix = process.env.SSM_PREFIX;
  if (!ssmPrefix) {
    return Promise.resolve(fromEnv());
  }
  cached ??= fromSsm(ssmPrefix).catch((error) => {
    // Don't cache a failure: the next request tries again.
    cached = undefined;
    throw error;
  });
  return cached;
}

/** True when running in AWS Lambda, where requests must come through CloudFront. */
export const isLambda = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function fromEnv(): Config {
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

// Parameter names relative to SSM_PREFIX. Must match `params` in aws/infra/locals.tf.
const PARAMS = {
  sanityProjectId: "/sanity/project-id",
  sanityDataset: "/sanity/dataset",
  sanityApiReadToken: "/sanity/api-read-token",
  originVerifySecret: "/origin-verify",
} satisfies Record<keyof Config, string>;

async function fromSsm(prefix: string): Promise<Config> {
  const names = Object.values(PARAMS).map((name) => prefix + name);
  const result = await new SSMClient({}).send(
    new GetParametersCommand({ Names: names, WithDecryption: true }),
  );
  if (result.InvalidParameters?.length) {
    throw new ConfigError(
      `SSM parameters missing: ${result.InvalidParameters.join(", ")}. See "Deploying to AWS" in README.md.`,
    );
  }
  const values = new Map(
    result.Parameters?.map((p) => [p.Name, p.Value ?? ""]) ?? [],
  );
  const config = Object.fromEntries(
    Object.entries(PARAMS).map(([key, name]) => [key, values.get(prefix + name)]),
  ) as Config;
  return config;
}
