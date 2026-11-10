# Setup

## Install

For local development:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

For production, follow [Deploy](#deploy).

## Configuration

Bind each `env.<NAME>` from Cloudflare Secrets or Variables. Runtime behavior is the same; Secrets remain out of tracked config.

| Name                   | Required                  | Set with     | Purpose                                                      |
| ---------------------- | ------------------------- | ------------ | ------------------------------------------------------------ |
| `DB`                   | yes                       | D1 binding   | Stores accepted submissions                                  |
| `FORM_CONFIG`          | yes                       | `[vars]`     | Per-form origin, validation, spam, and notification settings |
| `TURNSTILE_SECRET_KEY` | when Turnstile is enabled | Worker secret | Verifies Turnstile responses                                 |
| `IP_HASH_SECRET`       | optional                  | Worker secret | Stores a salted IP hash instead of the raw IP                |
| `RESEND_API_KEY`       | optional                  | Worker secret | Enables Resend notification emails                           |
| `NOTIFICATION_TO`      | optional                  | `[vars]`     | Destination for accepted submission notifications            |
| `EMAIL_FROM`           | optional                  | `[vars]`     | Verified sender used by Resend                               |
| `NOTIFICATION_TIME_ZONE` | optional                | `[vars]`     | Time zone used in notification email timestamps              |

See `.dev.vars.example` for local values.

Local notification testing can use the same email path as production when the
ignored local env file includes `RESEND_API_KEY`, `NOTIFICATION_TO`, and
`EMAIL_FROM`. Keep real local secrets out of git. If local email is not needed,
omit `RESEND_API_KEY`; submissions will still be accepted and stored locally,
but notification delivery will be skipped.

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

`emailFields` must look like valid email addresses. `dateFields` must use `YYYY-MM-DD` and be today or later. The backend rejects invalid values, but browsers only block past dates in the date picker when the embedded page sets `min` on the `<input type="date">`. See `examples/contact.html` for a copyable client-side `min` example. `minLength` sets a minimum character count per field:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "minLength": { "message": 20 }
  }
}
```

Set `requireBusinessEmail` to reject `emailFields` that use a free or personal provider (Gmail, Outlook, Yahoo, iCloud, disposable inboxes, and similar). Add `blockedEmailDomains` to block more domains, with or without `requireBusinessEmail`:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "emailFields": ["email"],
    "requireBusinessEmail": true,
    "blockedEmailDomains": ["competitor.example"]
  }
}
```

Blocked addresses are rejected with `Please use your work email address.`, which embedded pages can display as-is. The Worker is the enforcement point.

Turnstile is disabled by default. Set `turnstile` to `true` only when a
form should require Cloudflare Turnstile. Use `turnstileAction` and
`turnstileHostnames` to make the server verify that the token was minted for
the expected frontend surface:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "requiredFields": ["email", "message"],
    "turnstile": true,
    "turnstileAction": "contact",
    "turnstileHostnames": ["example.com"]
  }
}
```

Production hostname lists should contain only production hostnames. Keep
`localhost` in `allowedOrigins` for local form testing, but do not include it in
`turnstileHostnames` for production deployments.

## Embedded form

Point your form at the deployed Worker endpoint for the matching form id:

```html
<form method="POST" action="https://forms.example.com/submit/contact">
```

The form id in the path, `contact` above, must match a key in `FORM_CONFIG`. The page origin must also be listed in `allowedOrigins`, including any local preview origins you use during testing.

`form` returns JSON instead of redirecting. Embedded pages should intercept submit with `fetch`, show a success message or redirect after `response.ok`, and read `{ "error": "..." }` for validation failures. Network failures such as DNS or CORS problems surface to browsers as fetch errors, so show a generic reachability message for those.

## Notifications

Set `RESEND_API_KEY`, `NOTIFICATION_TO`, and `EMAIL_FROM` to enable accepted-submission email notifications. `EMAIL_FROM` must use a sender verified in Resend.

Set `notification.subject` inside each form's `FORM_CONFIG` when you need a custom email subject.

To build the notification subject from a submitted field, set
`notification.subjectField`. `subjectPrefix` is prepended when the submitted
field is present, and `fallbackSubject` is used when it is blank:

```json
{
  "contact": {
    "notification": {
      "subjectField": "subject",
      "subjectPrefix": "example.com - ",
      "fallbackSubject": "New message"
    }
  }
}
```

Set `NOTIFICATION_TIME_ZONE` to an IANA time zone such as
`America/Los_Angeles` to render notification timestamps in local time. Without
it, notifications use the stored UTC timestamp.

### Verify delivery

The JSON response confirms that the Worker accepted the submission. It does not
prove that the notification email reached the inbox. The Worker stores accepted
submissions before it calls Resend, and notification errors are written to the
Worker log as `Notification email failed`.

After configuring a new form or sender, test both parts:

- Submit a valid form and confirm the response contains `{ "ok": true }`.
- Query D1 and confirm the submission was stored.
- Tail the Worker during a test submission and confirm the
  `Notification email accepted` log entry. `Notification email skipped` lists
  which of `RESEND_API_KEY`, `NOTIFICATION_TO`, and `EMAIL_FROM` the runtime is
  missing, and `Notification email failed` includes the Resend error.
- Check the Resend event for the test message. Confirm that the sender domain is
  verified and that the event reached a delivered state.
- Check the destination inbox, including spam and filtered tabs.

## Deploy

Deploy with Wrangler from a checkout of this repository:

1. Create the database with `npx wrangler d1 create <database>` and copy the
   printed `database_name` and `database_id` into the `[[d1_databases]]` block
   of your Wrangler config.
2. Set `name`, `FORM_CONFIG`, and the optional notification vars in the same
   config. For a custom domain, add a route such as
   `routes = [{ pattern = "forms.example.com", custom_domain = true }]`.
   Wrangler creates the DNS record when `example.com` is a zone in your
   Cloudflare account.
3. Apply migrations with `npx wrangler d1 migrations apply <database> --remote`.
4. Deploy with `npx wrangler deploy`.
5. Upload secrets as described below, then run the checks in
   [Verify delivery](#verify-delivery).

After deploy, wire your embedded form to `POST /submit/:formId`. See
`examples/contact.html`.

### Deploying from a separate config repository

Operators who run several deployments can keep their Wrangler configs in their
own repository and treat this one as a pinned dependency. Point `main` and
`migrations_dir` in each config at a checkout of this repository, for example
`main = "../form/src/index.ts"` and `migrations_dir = "../form/migrations"`, and
record the `form` commit or tag that the deployments use. Deploy by checking out
that pinned revision and running `npx wrangler deploy --config <path>`. Upgrading
then becomes a reviewed change to the pin, rather than an automatic deploy of
whatever is on `main`.

### Upload secrets

Give each site its own Worker, D1 database, and custom domain, with
`workers_dev = false` and `preview_urls = false` when the Worker should be
reachable only on that domain. Keep the site's secrets in an ignored env file in
`KEY=VALUE` form, because Cloudflare does not return secret values after upload
and the same file serves `wrangler dev --env-file`.

Upload secrets from that file rather than through the hidden `wrangler secret
put` prompt. The prompt receives no input in a non-interactive shell, and
Wrangler then uploads an empty value while still reporting success:

```bash
npx wrangler versions secret bulk secrets.json --config <config>
npx wrangler versions deploy <version-id>@100 --config <config> --yes
```

Check `RESEND_API_KEY` against the Resend API before uploading it, so a revoked
or mistyped key does not replace a working one. If a bad secret reaches
production, `npx wrangler rollback <version-id> --config <config>` restores the
earlier version together with its secret values. Finish with the checks in
[Verify delivery](#verify-delivery).

## Local origins

During local development the Worker's origin check blocks local previews because
they are not in `allowedOrigins`. Add the string `"localhost"` to
`allowedOrigins` in `.dev.vars` to allow any `http://localhost:*`,
`http://127.0.0.1:*`, or `http://0.0.0.0:*` port without listing each one:

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

