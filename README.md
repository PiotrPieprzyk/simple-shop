# simple-shop

A small shop for an artist selling a few mostly one-of-a-kind products. See [ROADMAP.md](ROADMAP.md) for the plan.

| Folder    | What it is                                                                   |
|-----------|------------------------------------------------------------------------------|
| `web/`    | Next.js app (server-rendered pages and, later, Route Handlers)               |
| `studio/` | Sanity Studio (content schemas). Deployed to `*.sanity.studio`, never to AWS |

## Prerequisites

- **Node.js 22.12 or newer.** Sanity 6 and `@sanity/client` 8 don't support Node 20. With nvm for Windows:
  `nvm install 22 && nvm use 22`.

## Running locally

```sh
cd web
cp .env.example .env.local   # then fill in the values, see "Setting up Sanity"
npm install
npm run dev                  # http://localhost:3000
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
8. To rotate the token: create a new one, update `web/.env.local` (and SSM from Milestone 2 on), redeploy, then delete
   the old one.

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
