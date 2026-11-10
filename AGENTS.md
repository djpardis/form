# Agent instructions

This repository is a Cloudflare Worker that receives embedded form submissions,
filters spam, stores them in D1, and optionally sends Resend notifications.
Human docs are [README.md](README.md) and [SETUP.md](SETUP.md). Follow them and
do not invent steps that they do not describe.

## Local setup

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

No Cloudflare account or Resend key is needed locally. With the notification
settings blank, submissions are stored and email is skipped.

## Checks

Run these before proposing a change. CI runs the same commands.

```bash
npm run check:public-identifiers
npm test
npm run smoke
```

## Deploying for a user

Follow [SETUP.md](SETUP.md#deploy) step by step.

- Give each site its own Worker, D1 database, and Wrangler config. Do not add a
  new site's form to an existing site's deployment.
- Copy the `database_id` printed by `wrangler d1 create` into the Wrangler
  config before applying remote migrations.
- Do not type secrets into a hidden `wrangler secret put` prompt from a
  non-interactive shell. The prompt receives no input and Wrangler uploads an
  empty value. Use `wrangler versions secret bulk` from a file, as SETUP.md
  describes, or ask the user to set the secret in the Cloudflare dashboard.
- Keep `"localhost"` in `allowedOrigins` so a local preview of the site can
  post to the deployed Worker. The site does not need a local Worker.
- Do not curl, open, or `dig` a new custom domain before Wrangler creates its
  DNS record. Resolvers cache the "does not exist" answer for up to 30 minutes,
  which breaks the form on that network after the deploy succeeds. Check it
  through the authoritative nameserver, as SETUP.md describes.
- A deploy is done when the checks in
  [Verify delivery](SETUP.md#verify-delivery) pass. A `{ "ok": true }` response
  alone does not show that the notification email was sent.

## Public repository rules

- Keep operator values out of tracked files: real email addresses, domains,
  account or database IDs, tokens, and local paths. Put them in an ignored
  Wrangler config, in `.dev.vars`, or in Cloudflare secrets.
  `npm run check:public-identifiers` enforces this.
- Use `example.com` addresses and placeholder IDs in docs, tests, and examples.
- Database migrations are forward-only. Add a new file under `migrations/`.
