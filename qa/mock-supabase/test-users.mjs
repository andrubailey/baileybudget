// Test identities for the QA mock auth server ONLY (mock-supabase/server.mjs).
// These accounts exist nowhere but this fake backend on localhost; they are
// not real credentials for Bailey Budget or anything else. Fixed ids so the
// seed data can attribute transactions to them deterministically. Passwords
// are generated on first use into .data/ (gitignored) so none live in git —
// for signing in by hand (`up --lan`), read them from .data/test-passwords.json.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const passwordFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data/test-passwords.json");

let passwords;
if (existsSync(passwordFile)) {
  passwords = JSON.parse(readFileSync(passwordFile, "utf8"));
} else {
  const make = () => `qa-${randomBytes(12).toString("base64url")}`;
  passwords = { andru: make(), geralyn: make() };
  mkdirSync(dirname(passwordFile), { recursive: true });
  writeFileSync(passwordFile, `${JSON.stringify(passwords, null, 1)}\n`);
}

export const TEST_USERS = {
  andru: {
    id: "a11c0000-0000-4000-8000-00000000a001",
    email: "andru@qa.test",
    password: passwords.andru,
    display_name: "Andru",
  },
  geralyn: {
    id: "a11c0000-0000-4000-8000-00000000a002",
    email: "geralyn@qa.test",
    password: passwords.geralyn,
    display_name: "Geralyn",
  },
};
