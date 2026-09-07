import { randomBytes, createHash } from "crypto";

// The raw token is shown to the user exactly once, at creation time — only
// its SHA-256 hash is ever stored, so a leaked database dump can't be used
// to log requests in as a Shortcut.
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
