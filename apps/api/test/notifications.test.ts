import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  eventSchema,
  FcmSender,
  PushError,
} from "../src/modules/notifications/notification-delivery";

test("event targets and chronology are validated", () => {
  const value = {
    title: "Rapat",
    type: "PARENT_MEETING",
    starts_at: "2026-09-20T09:00:00+07:00",
    targets: [{ type: "ALL" }],
  };
  assert.equal(eventSchema.safeParse(value).success, true);
  assert.equal(
    eventSchema.safeParse({ ...value, ends_at: "2026-09-19T09:00:00+07:00" })
      .success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...value, targets: [{ type: "STUDENT" }] }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...value, tenant_id: "injected" }).success,
    false,
  );
});

test("FCM signs OAuth assertion, sends HTTP v1 payload, caches tokens and classifies failures", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = {
    project_id: "langkahsiswa-test",
    client_email: "push@langkahsiswa-test.iam.gserviceaccount.com",
    private_key: keys.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
  let oauthCalls = 0,
    sends = 0,
    failure = false;
  const fakeFetch = (async (url: string, options: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") {
      oauthCalls++;
      const body = options.body as URLSearchParams;
      assert.equal(
        body.get("grant_type"),
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      );
      const [header, claims, signature] = body.get("assertion")!.split(".");
      assert.ok(
        verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${claims}`),
          keys.publicKey,
          Buffer.from(signature, "base64url"),
        ),
      );
      const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
      assert.equal(payload.iss, account.client_email);
      assert.equal(
        payload.scope,
        "https://www.googleapis.com/auth/firebase.messaging",
      );
      assert.equal(payload.exp - payload.iat, 3600);
      return Response.json({
        access_token: "test-oauth-token",
        expires_in: 3600,
      });
    }
    sends++;
    assert.equal(
      url,
      "https://fcm.googleapis.com/v1/projects/langkahsiswa-test/messages:send",
    );
    assert.equal(
      (options.headers as any).Authorization,
      "Bearer test-oauth-token",
    );
    const payload = JSON.parse(options.body as string).message;
    assert.equal(payload.token, "test-device-token");
    assert.deepEqual(payload.notification, { title: "Title", body: "Body" });
    assert.deepEqual(payload.data, { type: "GRADE" });
    if (failure)
      return Response.json(
        { error: { details: [{ errorCode: "UNREGISTERED" }] } },
        { status: 404 },
      );
    return Response.json({ name: "projects/langkahsiswa-test/messages/123" });
  }) as typeof fetch;
  const sender = new FcmSender(account, fakeFetch);
  await sender.send("test-device-token", "Title", "Body", { type: "GRADE" });
  await sender.send("test-device-token", "Title", "Body", { type: "GRADE" });
  assert.equal(oauthCalls, 1);
  assert.equal(sends, 2);
  failure = true;
  await assert.rejects(
    () => sender.send("test-device-token", "Title", "Body", { type: "GRADE" }),
    (error: unknown) =>
      error instanceof PushError && error.permanent && error.invalidToken,
  );
});
