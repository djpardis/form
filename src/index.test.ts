import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

class MockD1 {
  inserts: unknown[][] = [];

  prepare() {
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          this.inserts.push(values);
          return {};
        }
      })
    };
  }
}

function makeEnv(config = baseConfig()) {
  const db = new MockD1();
  const env = {
    DB: db as unknown as D1Database,
    FORM_CONFIG: JSON.stringify(config)
  } satisfies WorkerEnv;

  return { db, env };
}

function baseConfig() {
  return {
    contact: {
      allowedOrigins: ["https://site.test"],
      requiredFields: ["email", "message"],
      emailFields: ["email"],
      dateFields: [] as string[],
      minLength: undefined as Record<string, number> | undefined,
      maxLinks: 2,
      turnstile: false,
      requireBusinessEmail: undefined as boolean | undefined,
      blockedEmailDomains: undefined as string[] | undefined,
      blockedPhrases: undefined as string[] | undefined,
      notification: undefined as
        | { enabled?: boolean; subject?: string; replyToField?: string }
        | undefined
    }
  };
}

function post(body: Record<string, unknown>, headers: HeadersInit = {}) {
  return new Request("https://worker.test/submit/contact", {
    method: "POST",
    headers: {
      origin: "https://site.test",
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function testEmail() {
  return ["sender", "example.test"].join("@");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

describe("form Worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("stores accepted submissions and returns JSON for embedded forms", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://site.test"
    );
    expect(db.inserts).toHaveLength(1);
  });

  it("does not store honeypot spam", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello",
        website: "filled"
      }),
      env
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(db.inserts).toHaveLength(0);
  });

  it("does not store submissions above the link limit", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "https://one.test https://two.test https://three.test",
        website: ""
      }),
      env
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(0);
  });

  it("does not store submissions that contain a blocked phrase", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        blockedPhrases: ["opt out", "unsubscribe"]
      }
    });

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Respond with stop to opt out.",
        website: ""
      }),
      env
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(db.inserts).toHaveLength(0);
  });

  it("stores submissions that do not match any blocked phrase", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        blockedPhrases: ["opt out", "unsubscribe"]
      }
    });

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello, I have a question about your product.",
        website: ""
      }),
      env
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
  });

  it("rejects submissions that are too short for a minLength field", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        minLength: { message: 20 }
      }
    });

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hi", website: "" }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Field too short: message (minimum 20 characters)"
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects disallowed origins", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post(
        { email: testEmail(), message: "Hello", website: "" },
        { origin: "https://other.test" }
      ),
      env
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Origin not allowed"
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("returns clear errors for invalid form config", async () => {
    const db = new MockD1();
    const env = {
      DB: db as unknown as D1Database,
      FORM_CONFIG: JSON.stringify({ contact: { allowedOrigins: [] } })
    } satisfies WorkerEnv;

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Form "contact" allowedOrigins must be a non-empty array'
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects invalid email field values", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post({ email: "not-an-email", message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Email field must be valid: email"
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects free email providers when business email is required", async () => {
    const { db, env } = makeEnv({
      contact: { ...baseConfig().contact, requireBusinessEmail: true }
    });

    const response = await worker.fetch(
      post({ email: "person@gmail.com", message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please use your work email address."
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("accepts work email addresses when business email is required", async () => {
    const { db, env } = makeEnv({
      contact: { ...baseConfig().contact, requireBusinessEmail: true }
    });

    const response = await worker.fetch(
      post({ email: ["sender", "acme.co"].join("@"), message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
  });

  it("rejects custom blocked email domains", async () => {
    const { db, env } = makeEnv({
      contact: { ...baseConfig().contact, blockedEmailDomains: ["example.test"] }
    });

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please use your work email address."
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("stores submissions with date fields set to today or later", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        requiredFields: ["email", "message", "eventDate"],
        dateFields: ["eventDate"]
      }
    });

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello",
        eventDate: today(),
        website: ""
      }),
      env
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
  });

  it("rejects date fields in the past", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        requiredFields: ["email", "message", "eventDate"],
        dateFields: ["eventDate"]
      }
    });

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello",
        eventDate: yesterday(),
        website: ""
      }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Date field must be today or later: eventDate"
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects invalid date field values", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        requiredFields: ["email", "message", "eventDate"],
        dateFields: ["eventDate"]
      }
    });

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello",
        eventDate: "2026-02-31",
        website: ""
      }),
      env
    );

    expect(response.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });

  it("sends notifications after storing accepted submissions", async () => {
    const { db, env } = makeEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      {
        ...env,
        RESEND_API_KEY: "re_test_key",
        NOTIFICATION_TO: "PRIVATE_DESTINATION_ADDRESS",
        EMAIL_FROM: "PRIVATE_VERIFIED_SENDER"
      }
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).not.toContain("Website:");
    expect(body.text).not.toContain("(blank)");
    expect(body.html).toBeUndefined();
  });

  it("preserves DJ capitalization in notification labels", async () => {
    const { db, env } = makeEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await worker.fetch(
      post({
        email: testEmail(),
        message: "Hello",
        dj_name: "Pardis",
        dj_software: "Serato DJ Pro"
      }),
      {
        ...env,
        RESEND_API_KEY: "re_test_key",
        NOTIFICATION_TO: "PRIVATE_DESTINATION_ADDRESS",
        EMAIL_FROM: "PRIVATE_VERIFIED_SENDER"
      }
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("DJ name:\nPardis");
    expect(body.text).toContain("DJ software:\nSerato DJ Pro");
  });

  it("uses a form-specific notification subject", async () => {
    const { db, env } = makeEnv({
      contact: {
        ...baseConfig().contact,
        notification: {
          subject: "Form-specific notification subject"
        }
      }
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      {
        ...env,
        RESEND_API_KEY: "re_test_key",
        NOTIFICATION_TO: "PRIVATE_DESTINATION_ADDRESS",
        EMAIL_FROM: "PRIVATE_VERIFIED_SENDER"
      }
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      subject: "Form-specific notification subject"
    });
  });

  it("formats notification timestamps in a configured time zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T19:11:49.660Z"));
    const { db, env } = makeEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await worker.fetch(
      post({ email: testEmail(), message: "Hello", website: "" }),
      {
        ...env,
        RESEND_API_KEY: "re_test_key",
        NOTIFICATION_TO: "PRIVATE_DESTINATION_ADDRESS",
        EMAIL_FROM: "PRIVATE_VERIFIED_SENDER",
        NOTIFICATION_TIME_ZONE: "America/Los_Angeles"
      }
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("Submitted at: Jun 1, 2026, 12:11 PM PDT");
  });
});
