import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

// Only the server function and the asset files are deployed (see ROADMAP.md, Architecture).
// Pages render dynamically, so there is no ISR cache, revalidation queue or tag cache:
// the no-op ("dummy") overrides keep the server function from expecting
// CACHE_BUCKET_NAME, REVALIDATION_QUEUE_URL or CACHE_DYNAMO_TABLE.
const config = {
  default: {
    override: {
      // Buffered responses (no streaming), invoked through a Lambda function URL,
      // whose event has the API Gateway v2 payload format.
      wrapper: "aws-lambda",
      converter: "aws-apigw-v2",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  dangerous: {
    disableIncrementalCache: true,
    disableTagCache: true,
  },
} satisfies OpenNextConfig;

export default config;
