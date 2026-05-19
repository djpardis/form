# Setup

This guide covers Cloudflare and notification setup for a deployed form backend.

## Install dependencies

```sh
npm install
```

## Create a D1 database

```sh
npx wrangler d1 create form_submissions
```

Copy the returned `database_id` into your deployed Worker configuration.

## Apply migrations

For local development:

```sh
npm run db:migrate:local
```

For production:

```sh
npm run db:migrate
```

## Configure secrets

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put IP_HASH_SECRET
npx wrangler secret put RESEND_API_KEY
```

`RESEND_API_KEY` is only needed when email notifications are enabled.

## Configure forms

Forms are configured through the `FORM_CONFIG` variable.

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

The Worker validates this config at runtime and returns a clear error when a
form is missing required settings or uses the wrong value type.

Use `requiredFields` only for fields your form must collect:

```json
{
  "contact": {
    "allowedOrigins": ["https://example.com"],
    "requiredFields": ["email", "message"]
  }
}
```

Fields listed in `emailFields` must look like valid email addresses. Add the
same field to `requiredFields` when the email address must be present.

Fields listed in `dateFields` must use the `YYYY-MM-DD` format and must be today
or later. Add the same field to `requiredFields` when the date must be present.

The form id in the config maps to the endpoint path:

```txt
/submit/contact
```

## Configure notifications

Set these Worker variables when using Resend notifications:

- `NOTIFICATION_TO`: destination for accepted submissions
- `EMAIL_FROM`: verified sender used by Resend

If any notification value is missing, submissions are still stored but email is
not sent.

## Deploy

```sh
npm run deploy
```

Deployment-specific values should be configured through Cloudflare secrets and
environment variables.