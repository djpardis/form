# Submissions

Accepted submissions are stored in the `submissions` D1 table.

## Schema

- `id`: unique submission id
- `form_id`: configured form id
- `submitted_at`: ISO timestamp
- `origin`: request origin
- `ip_hash`: salted IP hash when `IP_HASH_SECRET` is configured
- `user_agent`: request user agent
- `payload`: submitted fields as JSON
- `checks`: spam and validation checks as JSON

## Query submissions

For local development:

```sh
npx wrangler d1 execute form_submissions \
  --local \
  --command "SELECT id, form_id, submitted_at, payload FROM submissions ORDER BY submitted_at DESC LIMIT 20"
```

For production:

```sh
npx wrangler d1 execute form_submissions \
  --remote \
  --command "SELECT id, form_id, submitted_at, payload FROM submissions ORDER BY submitted_at DESC LIMIT 20"
```

## Delete a submission

```sh
npx wrangler d1 execute form_submissions \
  --remote \
  --command "DELETE FROM submissions WHERE id = 'SUBMISSION_ID'"
```

## Delete old submissions

```sh
npx wrangler d1 execute form_submissions \
  --remote \
  --command "DELETE FROM submissions WHERE submitted_at < 'YYYY-MM-DDT00:00:00.000Z'"
```

## Export submissions

Wrangler can export a D1 database with:

```sh
npx wrangler d1 export form_submissions --remote --output submissions.sql
```

Choose a retention policy that matches the fields your forms collect and the
requirements for your deployment.
