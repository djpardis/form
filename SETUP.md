# Setup

## Install

```bash
npm install
npx wrangler d1 create form_submissions   # copy the returned uuid into wrangler.toml → database_id
npm run db:migrate
```

For local development:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

## Configuration

Bind each `env.<NAME>` from Cloudflare Secrets or Variables. Runtime behavior is the same; Secrets stay out of tracked config.

| Name                   | Required                  | Set with     | Purpose                                                      |
| ---------------------- | ------------------------- | ------------ | ------------------------------------------------------------ |
| `DB`                   | yes                       | D1 binding   | Stores accepted submissions                                  |
| `FORM_CONFIG`          | yes                       | `[vars]`     | Per-form origin, validation, spam, and notification settings |
| `TURNSTILE_SECRET_KEY` | when Turnstile is enabled | `secret put` | Verifies Turnstile responses                                 |
| `IP_HASH_SECRET`       | optional                  | `secret put` | Stores a salted IP hash instead of the raw IP                |
| `RESEND_API_KEY`       | optional                  | `secret put` | Enables Resend notification emails                           |
| `NOTIFICATION_TO`      | optional                  | `[vars]`     | Destination for accepted submission notifications            |
| `EMAIL_FROM`           | optional                  | `[vars]`     | Verified sender used by Resend                               |
| `NOTIFICATION_SUBJECT` | optional                  | `[vars]`     | Default subject for notification emails                      |

See `.dev.vars.example` for local values.

## Form config

Forms are configured through `FORM_CONFIG`:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "emailFields": ["email"],
    "dateFields": ["eventDate"],
    "maxLinks": 3,
    "notification": {
      "subject": "New contact form submission",
      "replyToField": "email"
    }
  }
}
```

Use `requiredFields` only for fields your form must collect:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "requiredFields": ["email", "message"]
  }
}
```

`emailFields` must look like valid email addresses. `dateFields` must use `YYYY-MM-DD` and be today or later. The backend rejects invalid values, but browsers only block past dates in the date picker when the embedded page sets `min` on the `<input type="date">`. See `examples/contact.html` for a copyable client-side `min` example.

## Embedded form

Point your form at the deployed Worker endpoint for the matching form id:

```html
<form method="POST" action="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/submit/contact">
```

The form id in the path, `contact` above, must match a key in `FORM_CONFIG`. The page origin must also be listed in `allowedOrigins`, including any local preview origins you use during testing.

`form` returns JSON instead of redirecting. Embedded pages should intercept submit with `fetch`, show a success message or redirect after `response.ok`, and read `{ "error": "..." }` for validation failures. Network failures such as DNS or CORS problems surface to browsers as fetch errors, so show a generic reachability message for those.

## Notifications

Set `RESEND_API_KEY`, `NOTIFICATION_TO`, and `EMAIL_FROM` to enable accepted-submission email notifications. `EMAIL_FROM` must use a sender verified in Resend.

Use `NOTIFICATION_SUBJECT` when every form on the Worker should share the same email subject. Use `notification.subject` inside a form's `FORM_CONFIG` when each form needs its own subject.

## Deploy

```bash
npm run deploy
```

After deploy, check `GET /` and wire your embedded form to `POST /submit/:formId`. See `examples/contact.html`.

The Worker is available at `https://<name>.<subdomain>.workers.dev` by default. To also serve it on your own domain, add a route to `wrangler.toml` before deploying:

```toml
[[routes]]
pattern = "forms.example.com"
custom_domain = true
```

Wrangler creates the DNS record automatically if `example.com` is a zone in your Cloudflare account.

## Local origins

During local development the Worker's origin check blocks `localhost` because it is not in `allowedOrigins`. Add the string `"localhost"` to `allowedOrigins` in `.dev.vars` to allow any `http://localhost:*` port without listing each one:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com", "localhost"]
  }
}
```

## API

| Method    | Path              | Auth             | Description                                        |
| --------- | ----------------- | ---------------- | -------------------------------------------------- |
| `GET`     | `/`               | -                | Liveness check                                     |
| `OPTIONS` | `/submit/:formId` | origin allowlist | CORS preflight                                     |
| `POST`    | `/submit/:formId` | origin allowlist | Validate, spam-check, store, and optionally notify |
| `POST`    | `/:formId`        | origin allowlist | Short form of `/submit/:formId`                    |

## Submission storage

Accepted submissions are stored in the `submissions` D1 table. Spam submissions are rejected before the database insert.

IP addresses are not stored directly; when `IP_HASH_SECRET` is configured, the Worker stores only a salted hash.

Useful D1 commands:

```bash
npx wrangler d1 execute form_submissions --local --command "SELECT id, form_id, submitted_at, payload FROM submissions ORDER BY submitted_at DESC LIMIT 20"
npx wrangler d1 execute form_submissions --remote --command "DELETE FROM submissions WHERE id = 'SUBMISSION_ID'"
npx wrangler d1 export form_submissions --remote --output submissions.sql
```

## Testing

```bash
npm test
```

For local browser testing, serve the example form:

```bash
python3 -m http.server 8000 --directory examples
```

