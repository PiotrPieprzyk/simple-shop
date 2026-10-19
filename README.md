# simple-shop

A small shop for an artist selling a few mostly one-of-a-kind products. See [ROADMAP.md](ROADMAP.md) for the plan.

| Folder    | What it is                                                                   |
|-----------|------------------------------------------------------------------------------|
| `web/`    | Next.js app (server-rendered pages, Route Handlers for checkout and PayU)    |
| `studio/` | Sanity Studio (content schemas). Deployed to `*.sanity.studio`, never to AWS |
| `aws/`    | Terraform (`bootstrap/`, `infra/`) and Node deploy scripts (`ops/`). See [Deploying to AWS](#deploying-to-aws) |

## Prerequisites

- **Node.js 22.12 or newer.** Sanity 6 and `@sanity/client` 8 don't support Node 20. With nvm for Windows:
  `nvm install 22 && nvm use 22`.

## Running locally

```sh
cd web
cp .env.example .env.local   # then fill in the values, see "Setting up Sanity" and "Setting up PayU"
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (Vitest)
```

The home page shows the `homePage` document from Sanity. If the configuration or token is missing or wrong, the page
shows "Content unavailable". In development it also shows the reason, and the server log always has the details.

## Setting up Sanity

1. The Sanity project is **simple-shop** (ID `elq0qoon`, dataset `production`), managed at
   <https://www.sanity.io/manage>. The ID isn't secret and is set in `studio/sanity.config.ts` and `studio/sanity.cli.ts`.
2. Log in and start the Studio locally:

   ```sh
   cd studio
   npm install
   npx sanity login
   npx sanity schemas deploy    # upload the schema to the Content Lake
   npx sanity dev               # http://localhost:3333
   ```

   Open **Home page**, fill in the title and paragraph, and click **Publish**. The site shows only published content.
3. Set the dataset to private: *manage → project → Datasets → production → Visibility: Private*, or
   `npx sanity dataset visibility set production private`.
4. Create a read token: *API → Tokens → Add API token*, permission **Viewer** (or
   `npx sanity tokens add "web read" --role viewer`). The token is shown only once. Put it in
   `web/.env.local` with the project ID:

   ```sh
   SANITY_PROJECT_ID=elq0qoon
   SANITY_DATASET=production
   SANITY_API_READ_TOKEN=<token>
   ```

   These variables have no `NEXT_PUBLIC_` prefix, and `web/lib/sanity.ts` imports `server-only`, so the token never
   reaches the browser.
5. Deploy the hosted Studio with `npx sanity deploy` in `studio/`. It's published at
   <https://piotrpieprzyk-shop.sanity.studio> (`studioHost` in `studio/sanity.cli.ts`).
6. Invite the artist: *Members → Invite*, role **Editor**. Recommend turning on 2FA for the account they sign in with.
7. CORS origins aren't needed. The browser never calls Sanity directly; only the server does. (The Studio's own
   origins, `http://localhost:3333` and the `*.sanity.studio` host, are added by Sanity.)
8. To rotate the token: create a new one, update `web/.env.local` and SSM (see
   [Rotating secrets](#rotating-secrets)), redeploy, then delete the old one.

## Setting up PayU (sandbox)

The **Buy** button posts to `/api/checkout`, which creates a PayU order for a fixed test product (10.00 zł, set on
the server) and redirects the browser to PayU's payment page. PayU then sends the buyer back to `/payment/return`,
which only says "in progress or done": the payment state comes only from PayU's notification to `/api/payu/notify`.
Its `OpenPayu-Signature` is verified with the second key, and the order is fetched again from PayU before its status
is trusted.

1. **For a first local try**, PayU's public sandbox test POS works. Its values are in `web/.env.example` (POS
   `300746`). PayU can't reach `localhost`, so notifications never arrive locally; the signature check and the
   notification handler are covered by `npm test` with a recorded notification (`web/test/fixtures/`).
2. **Your own sandbox POS**, for the deployed app: register through <https://secure.snd.payu.com> (*Register*). In
   the sandbox panel, *Online payments → My shops → your shop → POS* shows the four values under *Configuration keys*:

   | PayU panel           | Local (`web/.env.local`) | AWS                                           |
   |----------------------|--------------------------|-----------------------------------------------|
   | POS ID (`pos_id`)    | `PAYU_POS_ID`            | `payu_pos_id` in `aws/infra/terraform.tfvars` |
   | OAuth `client_id`    | `PAYU_CLIENT_ID`         | `payu_client_id` in `terraform.tfvars`        |
   | OAuth `client_secret`| `PAYU_CLIENT_SECRET`     | SSM `/simple-shop/payu/client-secret` (CLI)   |
   | Second key (MD5)     | `PAYU_SECOND_KEY`        | SSM `/simple-shop/payu/second-key` (CLI)      |

   The base URL is `https://secure.snd.payu.com` (`PAYU_BASE_URL`, Terraform `payu_base_url`), so switching to
   production later is a config change. Until you have your own POS, `terraform.tfvars` uses the public test POS.
3. **Paying in the sandbox:** pick a test bank transfer and choose a successful outcome, or use a test card from
   PayU's docs (*Testing → Sandbox*). Then check the notification in the logs: `node aws/ops/logs.mjs --since 10m`
   should show `PayU notification verified: … COMPLETED`. A repeated notification is logged as `duplicate` (tracked in
   memory per Lambda instance until Milestone 4 stores orders in DynamoDB).

## Query types (TypeGen)

GROQ queries in `web/` are written with `defineQuery`, and their result types are generated into `web/sanity.types.ts`.
After changing the schema or a query, run:

```sh
cd studio
npm run typegen
```

## Checking that the token stays on the server

```sh
cd web
npm run build
grep -rl "<token value>" .next/static   # should print nothing
```

## Deploying to AWS

The site runs at <https://shop.piotrpieprzyk.com>: CloudFront in front of an S3 bucket (hashed build files,
`favicon.ico`) and a Lambda function URL (the OpenNext server function). See ROADMAP.md, *Architecture*.

```
aws/
  bootstrap/   one-time: S3 bucket for the Terraform state                        (Terraform)
  infra/       CloudFront, S3, Lambda, ACM, SSM parameters, Cloudflare DNS          (Terraform)
  ops/         deploy, status, logs                                                (Node + AWS CLI)
    lib/       aws CLI wrapper, terraform-output reader, zip helper
```

Terraform outputs are the only source of names and IDs: the ops scripts read `terraform output -json` and have no
config of their own.

### Prerequisites

1. **Terraform 1.11 or later**: `winget install Hashicorp.Terraform`, then `terraform version` in a new terminal.
2. **AWS CLI v2, signed in**: `aws login` (or `aws configure`), check with `aws sts get-caller-identity`. Terraform
   uses the same credentials.
3. **Node.js 22.12 or newer** (see above).
4. **Cloudflare API token**: <https://dash.cloudflare.com/profile/api-tokens> → *Create token* → *Custom token* with
   *Zone → DNS → Edit* for `piotrpieprzyk.com`. Give it to Terraform through the environment only:

   ```powershell
   $env:CLOUDFLARE_API_TOKEN = "<token>"      # PowerShell (this terminal only)
   ```

   ```sh
   export CLOUDFLARE_API_TOKEN=<token>         # Git Bash
   ```

   The zone ID is in [`aws/infra/terraform.tfvars`](aws/infra/terraform.tfvars). It's an ID, not a secret.

### First-time setup

1. **State bucket (once).** Creates the private, encrypted, versioned bucket `simple-shop-tfstate-<account-id>`. The
   bootstrap stack's own state stays in a local, git-ignored `terraform.tfstate`.

   ```sh
   cd aws/bootstrap
   terraform init
   terraform apply
   ```

2. **The stack.** Takes about 5–10 minutes, mostly the certificate validation and CloudFront.

   ```sh
   cd ../infra
   terraform init -backend-config="bucket=$(terraform -chdir=../bootstrap output -raw state_bucket)"
   terraform plan -out tfplan       # read it
   terraform apply tfplan
   ```

   The Lambda function starts with placeholder code that answers 503.

3. **Secrets in SSM.** Terraform creates the other parameters, but never these three, so their values stay out of the
   Terraform state. Use a Sanity token with the **Viewer** role (see [Setting up Sanity](#setting-up-sanity)) and the
   PayU values of the POS in `terraform.tfvars` (see [Setting up PayU](#setting-up-payu-sandbox)):

   ```sh
   # Git Bash. MSYS_NO_PATHCONV stops Git Bash from turning /simple-shop/... into a Windows path.
   put_secret() {
     read -rsp "$1: " VALUE && echo
     MSYS_NO_PATHCONV=1 aws ssm put-parameter --name "$2" --type SecureString --overwrite --value "$VALUE" > /dev/null
     unset VALUE
   }
   put_secret "Sanity token"       /simple-shop/sanity/api-read-token
   put_secret "PayU client secret" /simple-shop/payu/client-secret
   put_secret "PayU second key"    /simple-shop/payu/second-key
   ```

4. **Deploy** from the repository root:

   ```sh
   node aws/ops/deploy.mjs
   ```

   It builds `web/` with OpenNext, uploads the assets to S3 (before the code, so new pages never reference missing
   files), updates the Lambda code and publishes a version named after the git commit, invalidates CloudFront, and
   runs a smoke test: the site must answer 200 with content, the function URL called directly must answer 403, and
   `POST /api/payu/notify` with a bad signature must answer 400.

### Commands

| Infra task (in `aws/infra/`)  | Command                                   |
|-------------------------------|-------------------------------------------|
| Preview changes               | `terraform plan -out tfplan`              |
| Apply the previewed changes   | `terraform apply tfplan`                  |
| Show outputs (URL, IDs)       | `terraform output`                        |
| What Terraform manages        | `terraform state list`                    |
| Remove everything             | `terraform destroy` (see [Teardown](#teardown)) |

| Ops task (from the repo root)        | Command                                       |
|--------------------------------------|-----------------------------------------------|
| Build and deploy                     | `node aws/ops/deploy.mjs`                     |
| Deploy the existing build again      | `node aws/ops/deploy.mjs --skip-build`        |
| Status (last deploy, CloudFront)     | `node aws/ops/status.mjs`                     |
| Server logs                          | `node aws/ops/logs.mjs [--since 10m] [--follow]` |

**Adding a file to `web/public/`:** CloudFront serves each top-level entry of the build's assets from S3 through its
own behavior. Add the name (folders with a trailing `/`) to `static_paths` in `aws/infra/terraform.tfvars` and run
`terraform apply`. The deploy script warns when the list doesn't match the build.

### How the function URL is protected

The Lambda function URL is public (`authorization_type = "NONE"`): CloudFront's OAC signing for Lambda would require
an `x-amz-content-sha256` header on POSTs, which browsers and PayU don't send. Instead CloudFront adds a secret
`x-origin-verify` header, and [`web/proxy.ts`](web/proxy.ts) answers 403 to requests without it. The value is
generated by Terraform and stored in SSM (`/simple-shop/origin-verify`), where the function reads it. It's also in the
Terraform state, as part of the CloudFront config.

At runtime, [`web/lib/config.ts`](web/lib/config.ts) reads all parameters under `SSM_PREFIX` (`/simple-shop`) once per
Lambda instance. The Lambda environment holds only that prefix, never values.

### Rotating secrets

- **Sanity token, PayU client secret or second key:** run the matching `put_secret` line of step 3 of the first-time
  setup, then `node aws/ops/deploy.mjs --skip-build` (a code update starts new Lambda instances, which read SSM again).
  Then delete the old Sanity token. When switching to another PayU POS, also change `payu_pos_id` and `payu_client_id`
  in `terraform.tfvars` and run `terraform apply` before the redeploy.
- **Origin secret:** bump `origin_verify_version` in `terraform.tfvars`, `terraform apply`, then
  `node aws/ops/deploy.mjs --skip-build`. Until the redeploy, running instances still expect the old value and answer
  403; CloudFront also takes a few minutes to roll out the new header.

### Checks after the first deploy

```sh
curl -sI https://shop.piotrpieprzyk.com | grep -i cache-control              # private, no-cache, no-store ...
curl -s https://shop.piotrpieprzyk.com | grep -o '/_next/static/[^"]*' | head -1
curl -sI https://shop.piotrpieprzyk.com/_next/static/<file from above> | grep -i cache-control   # immutable
curl -sI "$(terraform -chdir=aws/infra output -raw function_url)"           # 403
curl -sI "https://$(terraform -chdir=aws/infra output -raw assets_bucket).s3.amazonaws.com/favicon.ico"   # 403
terraform -chdir=aws/infra plan                                               # No changes
```

### Teardown

```sh
cd aws/infra
terraform destroy
```

This removes the distribution, the bucket (with its files), the function, the certificate, the DNS records and the
SSM parameters Terraform created. The secret parameters aren't managed by Terraform; delete them yourself:

```sh
MSYS_NO_PATHCONV=1 aws ssm delete-parameters --names /simple-shop/sanity/api-read-token \
  /simple-shop/payu/client-secret /simple-shop/payu/second-key
```

The state bucket is protected by `prevent_destroy` (`aws/bootstrap/main.tf`). To remove it too, delete that line, then
empty the bucket (including old versions) and run `terraform destroy` in `aws/bootstrap/`. Check for leftovers:

```sh
aws resourcegroupstaggingapi get-resources --tag-filters Key=Project,Values=simple-shop
aws resourcegroupstaggingapi get-resources --tag-filters Key=Project,Values=simple-shop --region us-east-1
```
