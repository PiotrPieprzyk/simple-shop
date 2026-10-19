# Roadmap: simple-shop

A small shop for an artist selling a few mostly one-of-a-kind products (~70% unique, stock = 1).
Live at **<https://shop.piotrpieprzyk.com>**.

## Content

- [Decisions](#decisions)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Milestone 1: Next.js + Sanity](#milestone-1-nextjs--sanity)
- [Milestone 2: OpenNext build, Terraform, deploy script](#milestone-2-opennext-build-terraform-deploy-script)
- [Milestone 3: PayU sandbox payment](#milestone-3-payu-sandbox-payment)
- [Milestone 4: One-product catalog with stock in DynamoDB](#milestone-4-one-product-catalog-with-stock-in-dynamodb)
- [Milestone 5: Test emails with SES](#milestone-5-test-emails-with-ses)
- [Milestone 6: Later](#milestone-6-later)

---

## Decisions

| Area             | Choice                                                                                                       |
|------------------|--------------------------------------------------------------------------------------------------------------|
| Frontend + API   | **Next.js 16.4.2** (App Router), server rendering, Route Handlers for the backend                            |
| AWS adapter      | **OpenNext AWS 4.1.11** (`@opennextjs/aws`, pinned as a dev dependency)                                      |
| Content          | **Sanity**, hosted by Sanity (Content Lake + hosted Studio). **Private dataset**, read token on the server only |
| Payments         | **PayU** (sandbox first). Popular in Poland, supports BLIK, Polish bank transfers and cards                   |
| Infrastructure   | **Terraform** for AWS + Cloudflare. **Node.js scripts** (calling the AWS CLI) for build and deploy            |
| AWS              | CloudFront, S3, Lambda, DynamoDB, SSM Parameter Store, SES, ACM. Region **eu-central-1**                     |
| DNS              | **Cloudflare** (zone `piotrpieprzyk.com`), records managed by Terraform. `shop` is a DNS-only CNAME to CloudFront, the public HTTPS endpoint |

### Version pins

**Next.js 16.4.2 with OpenNext AWS 4.1.11**, the newest releases as of October 2026. OpenNext 4.1.11 declares
`next >=15.5.28 <16 || >=16.4.1` as its supported range, so the pair is compatible. Pin both to exact versions and
upgrade them together, checking OpenNext's `peerDependencies` first.

---

## Architecture

```
Browser ──HTTPS──▶ Cloudflare DNS (shop CNAME, DNS only)
                          │
                          ▼
                    CloudFront (ACM cert, us-east-1)
                    ├── /_next/static/*, public files ──▶ S3 assets bucket (private, OAC)
                    └── default (*) ─────────────────▶ Lambda function URL: OpenNext server function
                                                              │
                         ┌────────────────────┬──────────────┼──────────────┬─────────────────┐
                         ▼                    ▼              ▼              ▼                 ▼
                   Sanity API          SSM Parameter     DynamoDB       PayU API           SES
                   (private dataset)   Store (secrets)   (stock, M4)    (M3)               (M5)

PayU ──notification (POST)──▶ CloudFront ──▶ server function (/api/payu/notify)
```

We use only these parts of the [OpenNext architecture](https://opennext.js.org/aws/inner_workings/architecture):
**asset files**, the **server function** and **CloudFront**. These parts are left out:

| Left-out part              | Why                                                                                                        |
|----------------------------|------------------------------------------------------------------------------------------------------------|
| Image optimization function | Sanity's image CDN resizes images (`next.config` custom `loader`, or `images.unoptimized: true`)          |
| Incremental cache (S3)      | No ISR or SSG. Pages render dynamically (`export const dynamic = 'force-dynamic'`)                        |
| Revalidation queue (SQS)    | Same reason                                                                                               |
| Tag cache (DynamoDB)        | Same reason. `revalidateTag` isn't used                                                                   |
| Warmer                      | Cold starts are acceptable at this traffic                                                                |

In `open-next.config.ts`, set the cache, queue and tag-cache overrides to their no-op (`dummy`) implementations, so the
server function doesn't expect `CACHE_BUCKET_NAME`, `REVALIDATION_QUEUE_URL` or `CACHE_DYNAMO_TABLE`. Check the
override names against the OpenNext 4.x docs (*Overrides → Incremental Cache / Tag Cache / Queue*).

---

## Repository layout

The layout mirrors `../tic-tac-toe/aws` (bootstrap / infra / ops):

```
simple-shop/
  web/                 Next.js app (pages, Route Handlers, open-next.config.ts)
  studio/              Sanity Studio (schemas). Deployed to *.sanity.studio, never to AWS
  aws/
    bootstrap/         one-time: S3 bucket for Terraform state            (Terraform)
    infra/             CloudFront, S3, Lambda, DynamoDB, SES, ACM, SSM, Cloudflare DNS (Terraform)
    ops/               deploy, status, logs, seed scripts                 (Node + AWS CLI)
      lib/             aws CLI wrapper, terraform-output reader (same pattern as tic-tac-toe)
  README.md
  ROADMAP.md
```

**Rules carried over from tic-tac-toe:**

- Terraform outputs are the single source of truth for names and IDs. The ops scripts read `terraform output -json`
  and have no config of their own.
- Secrets live in **SSM SecureString** parameters, never in `.tf` or `.tfvars` files and never in git. Values Terraform
  doesn't generate are set once with the AWS CLI, and Terraform only references them by name.
- The Cloudflare API token is passed through `CLOUDFLARE_API_TOKEN` in the environment only.
- The state bucket is private, encrypted, versioned and TLS-only (copy `bootstrap/` from tic-tac-toe, renamed to
  `simple-shop-tfstate-<account-id>`).
- All resources are tagged `Project=simple-shop`.

---

## Milestone 1: Next.js + Sanity

**Goal:** one server-rendered page shows a paragraph loaded from a private Sanity dataset, and it runs locally.

### Tasks

1. **Next.js app in `web/`**
    - `create-next-app` with TypeScript, App Router and ESLint. Pin `next` to an exact version (see
      [Version pins](#version-pins)).
    - `app/page.tsx`: a server component with `export const dynamic = 'force-dynamic'` that renders a heading, **one
      paragraph from Sanity** and **one button**. The button does nothing yet; PayU is wired up in M3.
2. **Sanity project and Studio in `studio/`**
    - `npm create sanity@latest` creates the project and a dataset `production` with **visibility: private**.
    - Schema: a singleton document `homePage` with fields `title` (string) and `paragraph` (text).
    - Add one `homePage` document with test content in the Studio.
3. **Sanity client (server only)**
    - `web/lib/sanity.ts` starts with `import 'server-only'`, so a build fails if a client component imports it.
    - It uses `@sanity/client` (or `next-sanity`) with `projectId`, `dataset`, `apiVersion` (a fixed date) and
      `token`.
    - Reads env vars `SANITY_PROJECT_ID`, `SANITY_DATASET` and `SANITY_API_READ_TOKEN`. **No `NEXT_PUBLIC_` prefix**,
      so they never reach the browser bundle.
    - Locally they live in `web/.env.local` (git-ignored). Commit a `web/.env.example` with empty values.
    - Load the config through a small `getConfig()` function. In M2 it reads SSM in Lambda (the token is stored in
      SSM); locally it keeps reading `process.env`.
4. **README: "Setting up Sanity" section**
    1. Create an account and project at <https://www.sanity.io/manage> (free plan).
    2. Run `cd studio && npm install && npx sanity dev` to open the Studio locally at <http://localhost:3333>.
    3. Set the dataset to private: *manage → project → Datasets → production → Visibility: Private*.
    4. Create a read token: *API → Tokens → Add API token*, permission **Viewer**. Copy it into `web/.env.local`.
       The token is shown only once.
    5. Deploy the hosted Studio with `npx sanity deploy` (for example `piotrpieprzyk-shop.sanity.studio`).
    6. Invite the artist: *Members → Invite*, role **Editor**. Recommend 2FA on the account they sign in with.
    7. CORS origins aren't needed. The browser never calls Sanity directly; only the server does.
    8. Rotating the token: create a new one, update `.env.local` (and SSM from M2 on), redeploy, delete the old one.

### Done when

- `npm run dev` in `web/` shows the paragraph edited in the Studio after a page refresh.
- The token isn't in the client bundle: search `.next/static` for its value after `npm run build`.
- With the token removed, the page shows a clear error, because the dataset is private.

---

## Milestone 2: OpenNext build, Terraform, deploy script

**Goal:** the M1 page is live at <https://shop.piotrpieprzyk.com>, deployed by one command.

### Tasks

1. **OpenNext build**
    - Add `@opennextjs/aws@4.1.11` as a dev dependency and create `web/open-next.config.ts`. Use the default `aws-lambda`
      wrapper (no streaming) and the no-op cache, queue and tag overrides (see [Architecture](#architecture)).
    - `npx open-next build` produces `.open-next/assets/` and `.open-next/server-functions/default/` (handler
      `index.handler`). Ignore `image-optimization-function/` and `cache/`.
2. **`aws/bootstrap/`**: the state bucket, copied from tic-tac-toe.
3. **`aws/infra/` (Terraform)**, one file per concern:
    - `versions.tf` / `providers.tf` / `backend.tf`: providers `aws` (eu-central-1), `aws.us_east_1` (an alias,
      because CloudFront certificates must be in us-east-1) and `cloudflare`, with the S3 backend.
    - `assets.tf`: private S3 bucket (public access blocked, `BucketOwnerEnforced`, TLS-only). The bucket policy lets
      **only this CloudFront distribution** read it, through Origin Access Control (OAC).
    - `server.tf`:
        - Lambda on `nodejs22.x` and `arm64`, about 1024 MB and a 15 s timeout.
        - A CloudWatch log group with 14-day retention.
        - An IAM role with only `logs:*` on its own log group plus `ssm:GetParameter(s)` on `/simple-shop/*`. M4 and M5
          add more permissions.
        - Terraform creates the function with placeholder code and ignores later code changes
          (`lifecycle { ignore_changes = [filename, source_code_hash, s3_key] }`). The deploy script owns the code.
        - A **function URL**.
    - `cdn.tf`, the CloudFront distribution:
        - Behavior `_next/static/*` → S3, managed policy *CachingOptimized*.
        - One behavior per top-level entry in `public/` (e.g. `favicon.ico`) → S3. The list is `static_paths` in
          `terraform.tfvars`; `deploy.mjs` warns when it doesn't match the build.
        - Default behavior `*` → Lambda function URL with *CachingDisabled* to start, origin request policy
          *AllViewerExceptHostHeader*, and all HTTP methods allowed (POST is needed for Server Actions and PayU).
        - A **CloudFront Function** (viewer request) that copies `Host` into `x-forwarded-host`. Next.js needs the
          real host for redirects and absolute URLs.
        - `price_class = PriceClass_100`, HTTP → HTTPS redirect, TLS 1.2 minimum.
    - `certificate.tf`: ACM certificate for `shop.piotrpieprzyk.com` in us-east-1, with validation records written to
      Cloudflare (`proxied = false`).
    - `cloudflare.tf`: CNAME `shop` → `<dist>.cloudfront.net`, `proxied = false`, managed by Terraform. The Cloudflare
      token needs only *Zone → DNS → Edit*.
    - `secrets.tf`: SSM parameter names under `/simple-shop/`. The Sanity token is set with
      `aws ssm put-parameter --type SecureString` (documented in README), so its value never enters the Terraform
      state.
    - `outputs.tf`: region, bucket name, function name, distribution ID, app URL, SSM parameter names.
4. **Function URL protection**
    - **Don't use OAC for the Lambda function URL.** With OAC, CloudFront requires the caller to send an
      `x-amz-content-sha256` header on POST/PUT requests. Browsers (Server Actions) and PayU's notifications don't
      send it.
    - Instead, use `authorization_type = "NONE"` and have CloudFront add a secret **origin custom header**
      (e.g. `x-origin-verify: <random>`).
    - A check in `proxy.ts` (Next.js 16's replacement for `middleware.ts`) rejects requests without that header, so the raw
      `*.lambda-url.*` address can't be used to bypass CloudFront.
    - Generate the value with a `random_password` written to SSM with `value_wo`. It can't be `ephemeral` as in
      tic-tac-toe, because the CloudFront origin config (an ordinary attribute) needs it too. Accepted trade-off:
      the value is in the Terraform state.
5. **Secrets at runtime**
    - On a cold start, `getConfig()` reads the SSM parameters (`GetParameters` with decryption) and caches them per
      Lambda instance.
    - The Lambda environment holds only parameter **names** (e.g. `SSM_PREFIX=/simple-shop`), never values.
6. **`aws/ops/deploy.mjs`** (Node + AWS CLI, same structure as tic-tac-toe's `ops/lib/aws.mjs` and `outputs.mjs`):
    1. Warn if the working tree is dirty, and record `git rev-parse --short HEAD` as the version.
    2. `npm ci && npx open-next build` in `web/`.
    3. Upload assets **before** switching code, so pages from the new version never reference missing files:
        - `aws s3 sync .open-next/assets/_next s3://<bucket>/_next --cache-control "public,max-age=31536000,immutable"`
        - the remaining files with `--cache-control "public,max-age=0,s-maxage=31536000,must-revalidate"`
        - No `--delete` for `_next/`, because browsers still on the old version need the old hashed files. A
          `--prune` flag can remove files older than N deploys later.
    4. Zip `server-functions/default/`, then `aws lambda update-function-code --zip-file fileb://… --publish`, then
       `aws lambda wait function-updated`.
    5. `aws cloudfront create-invalidation --paths "/*"`. Only the un-hashed files need it, but `/*` is simple and the
       first 1,000 paths a month are free.
    6. Smoke test: `fetch(app_url)` must return 200 and contain a marker string. Print the URL and version.
    - Also add `ops/status.mjs` (Lambda version, last deploy, distribution status) and `ops/logs.mjs`
      (`aws logs tail /aws/lambda/<fn> --follow`).
7. **README:** prerequisites (Terraform ≥ 1.11, AWS CLI v2, Node 22, Cloudflare token), first-time setup (bootstrap →
   infra → put SSM secrets → deploy), the commands table, and teardown.

### Done when

- `terraform plan` on a fresh checkout shows no changes after the first apply.
- `node aws/ops/deploy.mjs` deploys, and <https://shop.piotrpieprzyk.com> shows the Sanity paragraph over a valid
  certificate.
- The Lambda function URL called directly returns 403 (no origin header).
- `https://<bucket>.s3.amazonaws.com/...` is denied. Only CloudFront can read the bucket.
- `/_next/static/*` responses carry `immutable` cache headers, and the HTML response isn't cached.

---

## Milestone 3: PayU sandbox payment

**Goal:** the button on the page starts a PayU **sandbox** payment with test data. The page shows the result, and the
server receives and verifies PayU's notification.

### Tasks

1. **PayU sandbox account**
    - Register at the PayU sandbox (<https://secure.snd.payu.com>) to get your own POS. It gives you
      `pos_id`, `second_key` (MD5), `client_id` and `client_secret`.
    - PayU's docs also list a shared public test POS, which is fine for a first local try. Use your own POS for
      anything deployed, so notifications reach your URL.
    - Store all four values in SSM under `/simple-shop/payu/*`. Locally, put them in `web/.env.local`. Also store the
      base URL (`https://secure.snd.payu.com`) as a non-secret setting, so switching to production is a config change.
2. **Backend (Next.js Route Handlers in `web/app/api/`)**
    - `lib/payu.ts` (`server-only`): OAuth `client_credentials` token
      (`POST /pl/standard/user/oauth/authorize`), cached until it expires.
    - `POST /api/checkout` (called by the button through a form or Server Action):
        - Creates an order with `POST /api/v2_1/orders`. Fields: `notifyUrl`, `continueUrl`, `customerIp` (from
          `x-forwarded-for`), `merchantPosId`, `description`, `currencyCode: PLN`, `totalAmount` (in grosze, e.g.
          `1000` = 10.00 zł), `extOrderId` (our own UUID) and `products`. The buyer is a test buyer.
        - **The amount and products are set on the server**; the request body from the browser isn't trusted for them.
        - Set redirects to manual (PayU answers `302` with `redirectUri`), then redirect the browser to `redirectUri`.
    - `POST /api/payu/notify`:
        - Read the **raw body**. Verify the `OpenPayu-Signature` header with the `second_key` (the `algorithm` field
          says MD5 or SHA-256) in constant time. Reject with 400 if it doesn't match.
        - Process each notification once: PayU retries until it gets a 200, so keep track of handled orders by
          `orderId` + `status`.
        - Log the order status (`PENDING`, `WAITING_FOR_CONFIRMATION`, `COMPLETED`, `CANCELED`) and return 200.
        - For extra safety, fetch the order with `GET /api/v2_1/orders/{id}` and trust that status rather than the
          notification body alone.
    - `GET /payment/return` (the `continueUrl`): shows "payment in progress or done". **It never marks an order as
      paid**, because anyone can open this URL. Payment state comes only from the notification.
3. **Deploy changes**
    - IAM: allow the Lambda to read `/simple-shop/payu/*`.
    - The `deploy.mjs` smoke test also calls `POST /api/payu/notify` with a bad signature and expects 400.
    - Document `put-parameter` for the PayU secrets in the README.
4. **Local testing of notifications:** PayU can't reach `localhost`, so test real notifications on the deployed app.
   Locally, unit-test the signature check and the handler with a recorded notification body.

### Done when

- Clicking the button opens the PayU sandbox page. Paying with a sandbox test method returns you to `/payment/return`.
- CloudWatch logs show a verified `COMPLETED` notification. Sending the same notification again is logged as a
  duplicate and causes no repeated work.
- A notification with a changed body is rejected with 400.

---

## Milestone 4: One-product catalog with stock in DynamoDB

**Goal:** one product from Sanity is shown with its image, title, price and a buy button. Once someone buys it, nobody
can buy it again.

### Tasks

1. **Sanity schema:** document `product` with `title`, `slug`, `image` (with hotspot), `price` (integer, in grosze, so
   prices are never floating point) and `quantity` (integer, default 1).
2. **Rendering:** the product image comes from Sanity's image CDN (`@sanity/image-url`, e.g. `w=800&auto=format`).
   Show the price formatted with `Intl.NumberFormat('pl-PL', {style: 'currency', currency: 'PLN'})`. The button is
   disabled with a "Sold" label when no stock is available.
3. **DynamoDB (Terraform `data.tf`)**
    - Table `simple-shop-inventory`, partition key `productId` (the Sanity `_id`), on-demand billing, point-in-time
      recovery turned on.
    - Item: `{productId, available, reservedUntil?, reservationId?, sold}`.
    - Table `simple-shop-orders`, keyed by `orderId` (our `extOrderId`): product, amount, PayU order ID, status,
      timestamps. This replaces M3's simple duplicate tracking.
    - IAM: the Lambda gets `GetItem`, `UpdateItem` and `PutItem` on these two tables only.
4. **Buying flow** (one item = stock 1. Design the update for `quantity > 1`, but test with 1):
    1. `POST /api/checkout` with `productId` only. The server loads the price from Sanity, never from the request.
    2. **Atomic reservation:** an `UpdateItem` with
       `ConditionExpression: available > :zero OR reservedUntil < :now` that sets `reservedUntil = now + 15 min`
       and `reservationId`. If the condition fails, return "Sold or reserved" (409).
    3. Create the PayU order with `validityTime` matching the reservation (900 s) and `extOrderId`, and save the order
       as `PENDING`.
    4. Notification `COMPLETED` → in one `TransactWriteItems`, mark the order `COMPLETED` and set inventory `sold = 1`,
       `available = 0`, clearing the reservation. Guard it with conditions so a duplicate notification is a no-op.
    5. Notification `CANCELED` → release the reservation, only if `reservationId` still matches.
    6. Expired reservations are released **lazily**, through the `reservedUntil < :now` condition. Don't rely on
       DynamoDB TTL, because it can take hours or days to delete items.
5. **Seeding stock:** `aws/ops/seed-inventory.mjs` reads products from Sanity and creates any missing inventory items
   (`attribute_not_exists(productId)`). It never overwrites existing stock. A Sanity webhook sync can replace it later
   (Milestone 6).
6. **Abuse limits:** cap each order at 1 item. Note in Milestone 6 that bots could lock stock by repeatedly reserving
   it (fix: rate limiting / Turnstile).

### Done when

- After a sandbox payment completes, the page shows "Sold", and a second checkout attempt returns 409.
- Two checkouts started at the same moment give one reservation and one 409. Test with a small script that sends
  parallel requests.
- A cancelled or abandoned payment makes the product buyable again after the reservation expires.

---

## Milestone 5: Test emails with SES

**Goal:** after a completed payment, the buyer gets a confirmation email and the shop owner gets a "please ship it"
email.

### Tasks

1. **SES (Terraform `email.tf`)**
    - Domain identity for `piotrpieprzyk.com` (or a subdomain such as `mail.piotrpieprzyk.com`) with **Easy DKIM**. The
      three DKIM CNAMEs go to Cloudflare through Terraform.
    - Custom MAIL FROM domain (MX + SPF TXT records in Cloudflare) and a DMARC TXT record, starting with `p=none`.
    - SES starts in **sandbox mode**: it only sends to verified addresses. For the test milestone, verify your own test
      addresses as email identities. Production access (Milestone 6) is a separate request to AWS.
    - IAM: the Lambda gets `ses:SendEmail` limited to this identity, with condition `ses:FromAddress` =
      `shop@piotrpieprzyk.com`.
2. **Sanity:** singleton `settings` document with `ownerEmail`. It's read on the server only and never rendered on a
   page.
3. **Catalog form:** an email input next to the buy button. Validate it on the server with zod (format and length).
   Send it to PayU as `buyer.email` and save it on the order.
4. **Sending**
    - The trigger is the `COMPLETED` notification (after the M4 transaction succeeds), never the button click or the
      return page.
    - **Buyer email:** order confirmation with product, price and order ID.
    - **Owner email:** "Product X was bought, ship it", with buyer email and order ID. Add the shipping address later.
    - Templates are plain text plus simple HTML. **Escape every value from the user or the CMS** before it goes into
      HTML.
    - Record `emailsSentAt` on the order with a condition, so PayU retries don't send duplicates. If sending fails,
      return 500 so PayU retries the notification.
5. **Abuse note:** a form that sends email to any typed-in address can be misused for spam. In this design an email is
   sent only after a real payment, which prevents that. Keep it that way.

### Done when

- A sandbox purchase sends both emails, and both arrive with SPF, DKIM and DMARC passing (check "Show original" in
  Gmail).
- A repeated notification sends no second email.
- The owner address changed in Sanity is used on the next purchase without a redeploy.

---

## Milestone 6: Later

Not planned yet. Candidates from earlier discussions:

- Real catalog: several products, product pages, a cart.
- Shipping: InPost parcel lockers (Geowidget), shipping address in the owner email.
- PayU production: switch the base URL and keys, payment methods (BLIK, bank transfers, cards), refunds process.
- SES production access, plus a bounce and complaint handling topic.
- Sanity webhook (with a verified signature) → Lambda that syncs inventory, replacing `seed-inventory.mjs`.
- Security hardening:
    - Security headers: CSP, HSTS, `frame-ancestors`, `Referrer-Policy`, via a CloudFront response headers policy.
    - AWS WAF rate-based rule or Cloudflare Turnstile on checkout, against bots locking up stock.
    - Dependency scanning with Dependabot.
- Monitoring: CloudWatch alarms on Lambda errors and failed notifications, sent to email through SNS.
- CI: deploy from GitHub Actions using OIDC (no long-lived AWS keys).
- Legal (Poland/EU): terms of sale, privacy policy, 14-day withdrawal right; check VAT, cash register (*kasa
  fiskalna*) and KSeF e-invoicing rules with an accountant.
