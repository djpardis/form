import { writeFileSync } from "node:fs";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlBool(name) {
  const value = optional(name);
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

const output = optional("WRANGLER_CONFIG") ?? "wrangler.generated.toml";
const customDomain = optional("WORKER_CUSTOM_DOMAIN");
const workersDev = tomlBool("WORKERS_DEV");
const previewUrls = tomlBool("PREVIEW_URLS");

const vars = {
  FORM_CONFIG: required("FORM_CONFIG"),
  NOTIFICATION_TO: optional("NOTIFICATION_TO"),
  EMAIL_FROM: optional("EMAIL_FROM"),
  NOTIFICATION_SUBJECT: optional("NOTIFICATION_SUBJECT")
};

const lines = [
  `name = ${tomlString(required("WORKER_NAME"))}`,
  `main = "src/index.ts"`,
  `compatibility_date = "2026-05-18"`
];

if (workersDev !== undefined) lines.push(`workers_dev = ${workersDev}`);
if (previewUrls !== undefined) lines.push(`preview_urls = ${previewUrls}`);
if (customDomain) {
  lines.push(
    `routes = [`,
    `  { pattern = ${tomlString(customDomain)}, custom_domain = true }`,
    `]`
  );
}

lines.push(``, `[vars]`);

for (const [key, value] of Object.entries(vars)) {
  if (value !== undefined) lines.push(`${key} = ${tomlString(value)}`);
}

lines.push(
  ``,
  `[[d1_databases]]`,
  `binding = "DB"`,
  `database_name = ${tomlString(required("D1_DATABASE_NAME"))}`,
  `database_id = ${tomlString(required("D1_DATABASE_ID"))}`,
  `migrations_dir = "migrations"`,
  ``
);

writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`Wrote ${output}`);
