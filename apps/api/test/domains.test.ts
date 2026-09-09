import test from "node:test";
import assert from "node:assert/strict";
import { verifyDomainDns } from "../src/domains";

test("custom domain accepts exact CNAME or ownership TXT proof", async () => {
  const cname = await verifyDomainDns(
    "school.example.id",
    "secret",
    "domains.langkahsiswa.id",
    {
      cname: async () => ["domains.langkahsiswa.id."],
      txt: async () => [],
    },
  );
  assert.equal(cname?.method, "CNAME");
  const txt = await verifyDomainDns(
    "school.example.id",
    "secret",
    "domains.langkahsiswa.id",
    {
      cname: async () => ["unrelated.example.id"],
      txt: async () => [["langkahsiswa-verification=", "secret"]],
    },
  );
  assert.equal(txt?.method, "TXT");
  assert.equal(
    await verifyDomainDns(
      "school.example.id",
      "secret",
      "domains.langkahsiswa.id",
      {
        cname: async () => [],
        txt: async () => [["wrong"]],
      },
    ),
    null,
  );
});
