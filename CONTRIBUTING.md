# Contributing

Thanks for helping improve form.

## Development

Install dependencies:

```sh
npm install
```

Run the test suite:

```sh
npm test
```

Start the local Worker:

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Serve the example form in another terminal:

```sh
python3 -m http.server 8000 --directory examples
```

## Pull requests

Before opening a pull request:

- Run `npm test`.
- Add or update tests for validation, spam filtering, storage, notification, or
  response behavior changes.
- Keep docs clear for people running their own deployment.
- Keep headings in sentence case.

Small, focused pull requests are easiest to review.
