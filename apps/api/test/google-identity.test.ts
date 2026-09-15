import { test } from "node:test";
import assert from "node:assert/strict";
import { TokenPayload } from "google-auth-library";
import { googleIdentity } from "../src/modules/auth/google-identity.verifier";

const claims = (fields: Partial<TokenPayload>) => ({
  iss: "https://accounts.google.com",
  aud: "test",
  iat: 1,
  exp: 2,
  sub: "google-subject",
  email: "User@gmail.com",
  email_verified: true,
  ...fields,
});
test("Google identity requires verified email and stable subject", () => {
  assert.throws(() => googleIdentity(undefined));
  assert.throws(() => googleIdentity(claims({ email_verified: false })));
  assert.throws(() => googleIdentity(claims({ sub: "" })));
  assert.deepEqual(googleIdentity(claims({})), {
    subject: "google-subject",
    email: "user@gmail.com",
    authoritative: true,
  });
});
test("third-party Google emails require account linking proof", () => {
  assert.equal(
    googleIdentity(claims({ email: "user@school.test" })).authoritative,
    false,
  );
  assert.equal(
    googleIdentity(claims({ email: "user@school.test", hd: "school.test" }))
      .authoritative,
    true,
  );
  assert.equal(
    googleIdentity(claims({ email: "user@gmail.com.evil.test" })).authoritative,
    false,
  );
});
