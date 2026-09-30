// ES256 signing for the QA mock's JWTs — sessions, plus the anon and
// service-role API keys the app is configured with. Persisted under .data/
// so browser sessions (and saved Playwright logins) survive a mock restart.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const keyFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data/jwt-es256.json");

let privateKey;
if (existsSync(keyFile)) {
  privateKey = createPrivateKey({ key: JSON.parse(readFileSync(keyFile, "utf8")), format: "jwk" });
} else {
  ({ privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }));
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, JSON.stringify(privateKey.export({ format: "jwk" })));
}
const publicKey = createPublicKey(privateKey);

export const KID = "qa-es256-1";
export const PUBLIC_JWK = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] };

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const sig = sign("sha256", Buffer.from(`${header}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${b64url(sig)}`;
}

export function verifyJwt(token) {
  if (!token || token.split(".").length !== 3) return null;
  const [h, p, s] = token.split(".");
  let ok = false;
  try {
    ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
  } catch {
    return null;
  }
  if (!ok) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

export const ANON_KEY = signJwt({ iss: "supabase-qa-mock", role: "anon", iat: 1700000000, exp: 4102444800 });
export const SERVICE_ROLE_KEY = signJwt({ iss: "supabase-qa-mock", role: "service_role", iat: 1700000000, exp: 4102444800 });
