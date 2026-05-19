# Testing

## Automated checks

Run:

```sh
npm test
```

`npm test` runs the Vitest behavior suite and TypeScript typechecking. The suite
covers accepted submissions, spam rejection, origin checks, configuration
validation, email validation, current-or-future date validation, and
notification delivery behavior.

## Local browser test

The complete embedded form example lives in `examples/contact.html`.

Copy the example local env file:

```sh
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with local values. The example disables Turnstile so the form
can be tested without creating a Turnstile site key first.

Apply the local D1 migration:

```sh
npm run db:migrate:local
```

Start the Worker:

```sh
npm run dev
```

In another terminal, serve the example form:

```sh
python3 -m http.server 8000 --directory examples
```

Open `http://localhost:8000/contact.html`, submit the form, and verify:

1. the page stays in place
2. the inline success message appears
3. the accepted submission is stored in local D1
4. a notification email is sent if email vars are configured

## Curl test

```sh
TEST_SENDER_ADDRESS="PRIVATE_SENDER_ADDRESS"

curl -i \
  -H "Origin: http://localhost:8000" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_SENDER_ADDRESS\",\"message\":\"Hello from curl\",\"website\":\"\"}" \
  http://localhost:8787/submit/contact
```

## Email delivery test

To test email delivery without running the Worker:

```sh
RESEND_API_KEY="re_..." \
NOTIFICATION_TO="PRIVATE_DESTINATION_ADDRESS" \
EMAIL_FROM="PRIVATE_VERIFIED_SENDER" \
npm run email:test
```

## Spam test cases

Use the local form or curl and verify these return success without creating a
stored submission:

- Fill the honeypot field, such as `website`.
- Send more links than the configured `maxLinks`.
- Enable Turnstile and submit without a valid Turnstile response.

