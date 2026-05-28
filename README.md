# form

<p align="center">
  <img src="assets/hero.png" alt="Vintage gallery interior with art and furniture" width="560">
</p>

A lightweight backend for embedded forms that need spam filtering, storage, and notifications.

`form` runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), stores accepted submissions in [D1](https://developers.cloudflare.com/d1/), and can send notifications through [Resend](https://resend.com/).

It returns JSON for same-page success states and supports origin allowlists, required fields, email validation, current-or-future date validation, honeypots, Turnstile, and generic success responses for spam.

[![CI](https://github.com/djpardis/form/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/form/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Requirements

- **Node** >= 20
- **Cloudflare** account - install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and run `npx wrangler login`
- **Resend** account - only needed for email notifications

## Quick start

```bash
npm install
npx wrangler d1 create form_submissions
npm run db:migrate
```

Local development: `cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev`.

## Deployment model

The checked-in `wrangler.toml` is local/default config. Merges to `main` auto-deploy when `WORKER_NAME` is set in the `production` GitHub environment; the job is skipped otherwise. Manual runs can target any environment.

Use GitHub environments for deployment-specific Worker names, D1 IDs, domains,
form config, notification senders, and secrets.

Full setup, configuration, API, testing, and submission-management details are in [SETUP.md](SETUP.md). The local embedded form example is [examples/contact.html](examples/contact.html).

## Project docs

- Setup: [SETUP.md](SETUP.md)
- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [MIT](LICENSE)

