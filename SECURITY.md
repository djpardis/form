# Security policy

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/djpardis/form/security/advisories/new).

Include a description and impact, steps to reproduce or a proof of concept
(placeholder data only, with no real submissions, email addresses, or keys),
and the affected commit SHA.

We aim to acknowledge reports within 3 business days and to ship a fix or
mitigation within 30 days for high and critical issues. Reporters are credited
in the changelog unless they prefer otherwise.

## Scope

In scope: code in this repository, the documented HTTP API (`/` and
`/submit/:formId`), origin allowlist and validation behavior, spam checks, and
notification email construction.

Out of scope: vulnerabilities in third-party services (Cloudflare and Resend,
which should be reported to the vendor), issues that require Cloudflare account
access or deployment secrets, and denial of service that requires sustained
traffic volumes.

## Supported versions

Only the `main` branch is supported.
