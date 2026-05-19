# Operations

## Submission flow

1. The embedded form submits with `fetch()`.
2. The Worker checks that the form id exists.
3. The request origin or referer must match the form's `allowedOrigins`.
4. Required fields must be present.
5. Honeypot fields must be empty.
6. Link count must be below `maxLinks`.
7. Turnstile must verify successfully.
8. The accepted submission is inserted into D1.
9. If notification vars are configured, an email is sent after storage.
10. The Worker returns JSON, and the embedded form shows an inline success state.

Rejected spam receives the same generic success response, but is not stored.

## Privacy and data

Accepted submissions are stored as JSON in D1. IP addresses are not stored
directly; when `IP_HASH_SECRET` is configured, the Worker stores only a salted
hash. Spam submissions are rejected before the database insert.

You are responsible for choosing what fields your forms collect, setting
retention policies, and complying with the privacy laws that apply to your
deployment.

## Contributing

See `../CONTRIBUTING.md`.