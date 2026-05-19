# form

<p align="center">
  <img src="docs/assets/hero.png" alt="Vintage gallery interior with art and furniture" width="720">
</p>

A lightweight backend for embedded forms that need spam filtering, storage, and notifications.

`form` runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/),
stores accepted submissions in [D1](https://developers.cloudflare.com/d1/), and
can send notifications through [Resend](https://resend.com/). It supports
origin allowlists, required fields, email validation, current-or-future date
validation, honeypots, Turnstile, and generic success responses for spam.

Submissions are designed for embedded forms. The Worker returns JSON, so the
page can stay in place and render inline success or error states.

[![CI](https://github.com/djpardis/form/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/form/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Requirements

- **Node** >= 20
- **Cloudflare** account - install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and run `npx wrangler login`
- **Resend** account - only needed for email notifications

## Setup

```bash
npm install
npx wrangler d1 create form_submissions
npm run db:migrate
```

Local development: `cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev`

Full setup guide: [docs/setup.md](docs/setup.md).

## Example

See `examples/contact.html` for an embedded form with same-page success and
error states.

## Scripts

```bash
npm run dev              # start local Worker
npm test                 # run behavior tests and typecheck
npm run db:migrate:local # apply local D1 migrations
npm run db:migrate       # apply remote D1 migrations
npm run deploy           # deploy Worker
```

## Project docs

- Setup: [docs/setup.md](docs/setup.md)
- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Testing: [docs/testing.md](docs/testing.md)
- Operations: [docs/operations.md](docs/operations.md)
- Submissions: [docs/submissions.md](docs/submissions.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [MIT](LICENSE)

