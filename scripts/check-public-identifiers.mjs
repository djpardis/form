import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CHECKS = [
  { name: "Resend API key", re: /\bre_[A-Za-z0-9_]{20,}\b/g },
  { name: "long token-looking hex string", re: /\b[a-f0-9]{48,}\b/gi },
  { name: "UUID", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: "local filesystem path", re: /\/(?:Users|home)\/[A-Za-z0-9._-]+\/[^\s)`'"]+/g },
  { name: "workers.dev subdomain", re: /\b[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/gi }
];
const SCANNED_EXTENSIONS = [".example", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".sql", ".toml", ".ts", ".yml"];
const PLACEHOLDER_DOMAINS = ["example.com", "example.net", "example.org"];
// Free-provider addresses that tests use to exercise business-email checks.
const PLACEHOLDER_EMAILS = ["person@gmail.com"];
const PLACEHOLDER_UUIDS = ["00000000-0000-0000-0000-000000000000"];

function files() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .filter((path) => path && path !== "package-lock.json" && SCANNED_EXTENSIONS.some((ext) => path.endsWith(ext)));
}

function allowed(kind, value) {
  const lower = value.toLowerCase();
  if (kind === "email") {
    return PLACEHOLDER_DOMAINS.includes(lower.split("@")[1]) || PLACEHOLDER_EMAILS.includes(lower);
  }
  if (kind === "UUID") return PLACEHOLDER_UUIDS.includes(lower);
  return false;
}

const violations = [];
for (const path of files()) {
  const text = readFileSync(path, "utf8");
  for (const value of text.match(EMAIL_RE) ?? []) {
    if (!allowed("email", value)) violations.push({ path, kind: "email", value });
  }
  for (const { name, re } of CHECKS) {
    for (const value of text.match(re) ?? []) {
      if (!allowed(name, value)) violations.push({ path, kind: name, value });
    }
  }
}

if (violations.length > 0) {
  console.error("Found non-placeholder identifiers in public files:");
  for (const { path, kind, value } of violations) console.error(`- ${path}: ${kind}: ${value}`);
  console.error("\nUse placeholders only. Do not commit real emails, secrets, IDs, domains, or local paths.");
  process.exit(1);
}

console.log("Public identifier check passed.");
