# form

A lightweight open source form backend for static sites, landing pages, and
small web apps.

It accepts embedded form submissions, filters likely spam before any database
write, stores accepted submissions in Cloudflare D1, and can send notification
emails through Resend.

Forms stay on the same page after submit and render inline success or error
states.

## Why form

Hosted form services are convenient, but they often force a redirect, charge for
simple usage, or keep submission data outside your infrastructure. form is for
small teams and personal sites that want embedded forms, spam filtering, and
submission storage on Cloudflare.

## Stack

- Cloudflare Workers for the public endpoint
- Cloudflare D1 for accepted submissions
- Cloudflare Turnstile for bot filtering
- Resend for optional email notifications
- Honeypot fields and link-count filtering before storage

This can run on Cloudflare's free tiers for small sites.

## Features

- Embedded same-page form submissions
- Form endpoints keyed by form id
- Origin allowlisting per form
- Required-field validation
- Honeypot and link-count spam filtering
- Validated runtime configuration
- Turnstile verification before database writes
- D1 storage for accepted submissions
- Optional Resend email notifications after storage
- Generic success responses for spam, without storing spam submissions

## Quick start

Install dependencies and start the Worker:

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

In another terminal, serve the example form:

```sh
python3 -m http.server 8000 --directory examples
```

Open `http://localhost:8000/contact.html`.

## Example

See `examples/contact.html` for a complete embedded form with same-page success
and error states.

## Testing

```sh
npm test
```

The test suite covers accepted submissions, spam rejection, origin checks,
configuration validation, and notification delivery behavior.

## Documentation

- [Setup](docs/setup.md)
- [Testing](docs/testing.md)
- [Operations](docs/operations.md)
- [Submissions](docs/submissions.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

This project is released under the MIT License. See `LICENSE`.