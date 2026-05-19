import { describe, expect, it, vi } from "vitest";
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
      maxLinks: 2,
      turnstile: false
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

describe("form Worker", () => {
  it("stores accepted submissions and returns JSON for embedded forms", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post({ email: "TEST_SENDER_ADDRESS", message: "Hello", website: "" }),
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
        email: "TEST_SENDER_ADDRESS",
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
        email: "TEST_SENDER_ADDRESS",
        message: "https://one.test https://two.test https://three.test",
        website: ""
      }),
      env
    );

    expect(response.status).toBe(202);
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects disallowed origins", async () => {
    const { db, env } = makeEnv();

    const response = await worker.fetch(
      post(
        { email: "TEST_SENDER_ADDRESS", message: "Hello", website: "" },
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
      post({ email: "TEST_SENDER_ADDRESS", message: "Hello", website: "" }),
      env
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Form "contact" allowedOrigins must be a non-empty array'
    });
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
      post({ email: "TEST_SENDER_ADDRESS", message: "Hello", website: "" }),
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
  });
});
