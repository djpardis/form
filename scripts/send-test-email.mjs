const required = ["RESEND_API_KEY", "NOTIFICATION_TO", "EMAIL_FROM"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    from: process.env.EMAIL_FROM,
    to: [process.env.NOTIFICATION_TO],
    subject: "Form email test",
    text: [
      "This is a test notification from the form project.",
      "",
      "If you received this, Resend notification delivery is configured correctly."
    ].join("\n")
  })
});

const body = await response.text();

if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(body);
