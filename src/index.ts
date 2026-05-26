type Env = {
  DB: D1Database;
  FORM_CONFIG: string;
  TURNSTILE_SECRET_KEY?: string;
  IP_HASH_SECRET?: string;
  RESEND_API_KEY?: string;
  NOTIFICATION_TO?: string;
  EMAIL_FROM?: string;
  NOTIFICATION_SUBJECT?: string;
};

type FormConfig = {
  allowedOrigins: string[];
  requiredFields?: string[];
  emailFields?: string[];
  dateFields?: string[];
  minLength?: Record<string, number>;
  maxLinks?: number;
  honeypotFields?: string[];
  turnstile?: boolean;
  notification?: EmailNotificationConfig;
};

type FormsConfig = Record<string, FormConfig>;

type EmailNotificationConfig = {
  enabled?: boolean;
  subject?: string;
  replyToField?: string;
};

type ParsedSubmission = {
  fields: Record<string, string>;
  turnstileToken?: string;
};

const DEFAULT_HONEYPOT_FIELDS = ["website", "url", "company"];
const RESERVED_FIELDS = new Set([
  "cf-turnstile-response",
  "turnstileToken",
  "started_at",
  "submit"
]);

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof ConfigError) {
        return json({ error: error.message }, 500);
      }

      console.error(error);
      return json({ error: "Internal server error" }, 500);
    }
  }
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return corsResponse(request, env);
  }

  if (request.method === "GET" && url.pathname === "/") {
    return json({ ok: true, service: "form" });
  }

  if (request.method !== "POST") {
    return json({ error: "Not found" }, 404);
  }

  const formId = getFormId(url);
  if (!formId) {
    return json({ error: "Missing form id" }, 404);
  }

  const forms = parseFormConfig(env.FORM_CONFIG);
  const config = forms[formId];
  if (!config) {
    return json({ error: "Unknown form" }, 404);
  }

  const originCheck = checkOrigin(request, config);
  if (!originCheck.ok) {
    return json({ error: originCheck.reason }, 403, corsHeaders(request, config));
  }

  const submission = await parseSubmission(request);
  const validation = validateSubmission(submission, config);
  if (!validation.ok) {
    return json({ error: validation.reason }, 400, corsHeaders(request, config));
  }

  const spamCheck = await checkSpam(request, env, config, submission);
  if (!spamCheck.ok) {
    return spamAcceptedResponse(request, config);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const ipHash = await hashIp(request, env);
  const userAgent = request.headers.get("user-agent");

  await env.DB.prepare(
    `INSERT INTO submissions
      (id, form_id, submitted_at, origin, ip_hash, user_agent, payload, checks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      formId,
      now,
      request.headers.get("origin"),
      ipHash,
      userAgent,
      JSON.stringify(submission.fields),
      JSON.stringify(spamCheck.checks)
    )
    .run();

  await sendNotificationEmail(env, formId, config, submission, id, now);

  return acceptedResponse(request, config, id);
}

function getFormId(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2 && parts[0] === "submit") {
    return parts[1];
  }

  return undefined;
}

function parseFormConfig(raw: string): FormsConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError("FORM_CONFIG must be valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new ConfigError("FORM_CONFIG must be a JSON object");
  }

  const forms: FormsConfig = {};

  for (const [formId, value] of Object.entries(parsed)) {
    if (!isRecord(value)) {
      throw new ConfigError(`Form "${formId}" must be a JSON object`);
    }

    forms[formId] = validateFormConfig(formId, value);
  }

  return forms;
}

function validateFormConfig(
  formId: string,
  config: Record<string, unknown>
): FormConfig {
  return {
    allowedOrigins: requiredStringArray(config, formId, "allowedOrigins"),
    requiredFields: optionalStringArray(config, formId, "requiredFields"),
    emailFields: optionalStringArray(config, formId, "emailFields"),
    dateFields: optionalStringArray(config, formId, "dateFields"),
    minLength: optionalStringToIntMap(config, formId, "minLength"),
    maxLinks: optionalNonNegativeInteger(config, formId, "maxLinks"),
    honeypotFields: optionalStringArray(config, formId, "honeypotFields"),
    turnstile: optionalBoolean(config, formId, "turnstile"),
    notification: optionalNotification(config, formId)
  };
}

function optionalNotification(
  config: Record<string, unknown>,
  formId: string
): EmailNotificationConfig | undefined {
  const value = config.notification;

  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new ConfigError(`Form "${formId}" notification must be a JSON object`);
  }

  return {
    enabled: optionalBoolean(value, formId, "notification.enabled"),
    subject: optionalString(value, formId, "notification.subject"),
    replyToField: optionalString(value, formId, "notification.replyToField")
  };
}

function requiredStringArray(
  config: Record<string, unknown>,
  formId: string,
  key: string
): string[] {
  const value = optionalStringArray(config, formId, key);

  if (!value || value.length === 0) {
    throw new ConfigError(`Form "${formId}" ${key} must be a non-empty array`);
  }

  return value;
}

function optionalStringArray(
  config: Record<string, unknown>,
  formId: string,
  key: string
): string[] | undefined {
  const value = config[key];

  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new ConfigError(`Form "${formId}" ${key} must be an array of strings`);
  }

  return value;
}

function optionalNonNegativeInteger(
  config: Record<string, unknown>,
  formId: string,
  key: string
): number | undefined {
  const value = config[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ConfigError(`Form "${formId}" ${key} must be a non-negative integer`);
  }

  return value;
}

function optionalBoolean(
  config: Record<string, unknown>,
  formId: string,
  key: string
): boolean | undefined {
  const value = config[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new ConfigError(`Form "${formId}" ${key} must be a boolean`);
  }

  return value;
}

function optionalString(
  config: Record<string, unknown>,
  formId: string,
  key: string
): string | undefined {
  const value = config[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Form "${formId}" ${key} must be a string`);
  }

  return value;
}

function optionalStringToIntMap(
  config: Record<string, unknown>,
  formId: string,
  key: string
): Record<string, number> | undefined {
  const value = config[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new ConfigError(`Form "${formId}" ${key} must be an object`);
  }

  const result: Record<string, number> = {};

  for (const [field, min] of Object.entries(value)) {
    if (typeof min !== "number" || !Number.isInteger(min) || min < 1) {
      throw new ConfigError(`Form "${formId}" ${key}.${field} must be a positive integer`);
    }
    result[field] = min;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseSubmission(request: Request): Promise<ParsedSubmission> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return normalizeFields(body);
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const body: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      body[key] = String(value);
    }

    return normalizeFields(body);
  }

  throw new Error("Unsupported content type");
}

function normalizeFields(body: Record<string, unknown>): ParsedSubmission {
  const fields: Record<string, string> = {};
  let turnstileToken: string | undefined;

  for (const [key, value] of Object.entries(body)) {
    const stringValue = String(value ?? "").trim();

    if (key === "cf-turnstile-response" || key === "turnstileToken") {
      turnstileToken = stringValue;
      continue;
    }

    if (!RESERVED_FIELDS.has(key)) {
      fields[key] = stringValue;
    }
  }

  return { fields, turnstileToken };
}

function validateSubmission(
  submission: ParsedSubmission,
  config: FormConfig
): { ok: true } | { ok: false; reason: string } {
  const requiredFields = config.requiredFields ?? [];

  for (const field of requiredFields) {
    if (!submission.fields[field]) {
      return { ok: false, reason: `Missing required field: ${field}` };
    }
  }

  for (const field of config.dateFields ?? []) {
    const value = submission.fields[field];

    if (value && !isTodayOrFutureDate(value)) {
      return {
        ok: false,
        reason: `Date field must be today or later: ${field}`
      };
    }
  }

  for (const field of config.emailFields ?? []) {
    const value = submission.fields[field];

    if (value && !isValidEmail(value)) {
      return {
        ok: false,
        reason: `Email field must be valid: ${field}`
      };
    }
  }

  for (const [field, min] of Object.entries(config.minLength ?? {})) {
    const value = submission.fields[field] ?? "";

    if (value.length < min) {
      return {
        ok: false,
        reason: `Field too short: ${field} (minimum ${min} characters)`
      };
    }
  }

  return { ok: true };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isTodayOrFutureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValidCalendarDate) {
    return false;
  }

  return value >= new Date().toISOString().slice(0, 10);
}

async function checkSpam(
  request: Request,
  env: Env,
  config: FormConfig,
  submission: ParsedSubmission
): Promise<{ ok: true; checks: Record<string, unknown> } | { ok: false }> {
  const honeypotFields = config.honeypotFields ?? DEFAULT_HONEYPOT_FIELDS;
  const filledHoneypot = honeypotFields.find((field) => submission.fields[field]);
  if (filledHoneypot) {
    return { ok: false };
  }

  if (countLinks(submission.fields) > (config.maxLinks ?? 3)) {
    return { ok: false };
  }

  const turnstileRequired = config.turnstile ?? true;
  if (turnstileRequired) {
    if (!submission.turnstileToken || !env.TURNSTILE_SECRET_KEY) {
      return { ok: false };
    }

    const turnstile = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      submission.turnstileToken,
      request.headers.get("CF-Connecting-IP") ?? undefined
    );

    if (!turnstile.success) {
      return { ok: false };
    }
  }

  return {
    ok: true,
    checks: {
      honeypot: "clear",
      linkCount: countLinks(submission.fields),
      turnstile: turnstileRequired ? "verified" : "disabled"
    }
  };
}

async function verifyTurnstile(
  secret: string,
  response: string,
  remoteip?: string
): Promise<{ success: boolean }> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", response);

  if (remoteip) {
    body.append("remoteip", remoteip);
  }

  const turnstileResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body }
  );

  if (!turnstileResponse.ok) {
    return { success: false };
  }

  return (await turnstileResponse.json()) as { success: boolean };
}

function countLinks(fields: Record<string, string>): number {
  return Object.values(fields).reduce((count, value) => {
    return count + (value.match(/https?:\/\//gi)?.length ?? 0);
  }, 0);
}

async function sendNotificationEmail(
  env: Env,
  formId: string,
  config: FormConfig,
  submission: ParsedSubmission,
  submissionId: string,
  submittedAt: string
): Promise<void> {
  if (config.notification?.enabled === false) {
    return;
  }

  if (!env.RESEND_API_KEY || !env.NOTIFICATION_TO || !env.EMAIL_FROM) {
    return;
  }

  const replyToField = config.notification?.replyToField ?? "email";
  const replyTo = submission.fields[replyToField];
  const subject =
    env.NOTIFICATION_SUBJECT ||
    config.notification?.subject ||
    `New ${formId} submission`;
  const text = formatEmailBody(formId, submissionId, submittedAt, submission.fields);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [env.NOTIFICATION_TO],
        subject,
        text,
        reply_to: replyTo || undefined
      })
    });

    if (!response.ok) {
      console.error("Notification email failed", await response.text());
    }
  } catch (error) {
    console.error("Notification email failed", error);
  }
}

function formatEmailBody(
  formId: string,
  submissionId: string,
  submittedAt: string,
  fields: Record<string, string>
): string {
  const fieldLines = Object.entries(fields)
    .map(([key, value]) => `${key}:\n${value || "(blank)"}`)
    .join("\n\n");

  return [
    `Form: ${formId}`,
    `Submission ID: ${submissionId}`,
    `Submitted at: ${submittedAt}`,
    "",
    fieldLines
  ].join("\n");
}

function checkOrigin(
  request: Request,
  config: FormConfig
): { ok: true } | { ok: false; reason: string } {
  const origin = request.headers.get("origin");

  if (!origin) {
    return { ok: false, reason: "Missing origin" };
  }

  if (isOriginAllowed(origin, config.allowedOrigins)) {
    return { ok: true };
  }

  return { ok: false, reason: "Origin not allowed" };
}

async function hashIp(request: Request, env: Env): Promise<string | null> {
  const secret = env.IP_HASH_SECRET;
  const ip = request.headers.get("CF-Connecting-IP");

  if (!secret || !ip) {
    return null;
  }

  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function acceptedResponse(
  request: Request,
  config: FormConfig,
  id: string
): Response {
  return json({ ok: true, id }, 202, corsHeaders(request, config));
}

function spamAcceptedResponse(
  request: Request,
  config: FormConfig
): Response {
  return json({ ok: true }, 202, corsHeaders(request, config));
}

function corsResponse(request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  });

  if (origin) {
    const forms = parseFormConfig(env.FORM_CONFIG);
    const allowedOrigins = new Set(
      Object.values(forms).flatMap((form) => form.allowedOrigins)
    );

    if (isOriginAllowed(origin, [...allowedOrigins])) {
      headers.set("access-control-allow-origin", origin);
    }
  }

  return new Response(null, { status: 204, headers });
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (allowedOrigins.includes("localhost") && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

function corsHeaders(request: Request, config: FormConfig): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");

  if (origin && isOriginAllowed(origin, config.allowedOrigins)) {
    headers.set("access-control-allow-origin", origin);
  }

  return headers;
}

function json(body: unknown, status = 200, headers = new Headers()): Response {
  headers.set("cache-control", "no-store");

  return Response.json(body, {
    status,
    headers
  });
}
