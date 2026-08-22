/**
 * @file Test credentials: an ephemeral keypair, generated per test run.
 *
 * Same shape as automation-service's testSupport/authTokens.ts. Tests exercise
 * the real verification path in auth.ts — no stub verifier, no bypass flag.
 * Only the trust anchor differs from production.
 */

import { generateKeyPairSync, sign } from "crypto";
import { SCOPE_FLEET_CONTROL } from "../auth";

const newKeyPair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

const { publicKey, privateKey } = newKeyPair();
/** A second, untrusted keypair — the app is never told about this one. */
const foreign = newKeyPair();

/** Pass as `auth.clerkJwtKeyPem` when constructing an app under test. */
export const TEST_CLERK_JWT_KEY = publicKey;

export const TEST_ACTOR = "user_2TestOperator";

const b64url = (value: string): string => Buffer.from(value).toString("base64url");

export interface TestTokenOptions {
  scopes?: string[];
  sub?: string;
  /** Negative offsets produce an already-expired token. */
  expiresInSeconds?: number;
  issuer?: string;
}

export function signTestToken(options: TestTokenOptions = {}): string {
  return signWith(privateKey, options);
}

function signWith(key: string, options: TestTokenOptions): string {
  const { scopes = [SCOPE_FLEET_CONTROL], sub = TEST_ACTOR, expiresInSeconds = 300, issuer } = options;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    sub,
    scope: scopes.join(" "),
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
    ...(issuer !== undefined ? { iss: issuer } : {}),
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

/** Ready-to-use `Authorization` header value for an operator with full control. */
export const bearer = (options: TestTokenOptions = {}): string => `Bearer ${signTestToken(options)}`;

/** A signed-in operator who holds no scope at all — the no-scope, empty case. */
export const bearerWithoutScope = (): string => bearer({ scopes: [] });

/** A well-formed token whose `exp` has already passed. */
export const expiredBearer = (): string => bearer({ expiresInSeconds: -60 });

/**
 * Correctly-shaped, correct scopes, valid `exp` — signed by a key the service
 * has never seen. The one token that proves the signature is actually checked
 * rather than the payload merely being decoded.
 */
export const foreignBearer = (): string => `Bearer ${signWith(foreign.privateKey, {})}`;
