/**
 * @file Clerk session verification, performed locally.
 *
 * Same shape as automation-service's auth.ts, deliberately: networkless RS256
 * verification via a PEM public key (CLERK_JWT_KEY), jose v5 (CJS, not v6 —
 * see the import comment below), no bypass flag.
 *
 * fleet-service has no machine caller and no agent:reset route, so this is
 * narrower than automation-service's: one scope, plus a no-scope
 * `requireSession` for the two reads (cooldown, cargo) that only need a
 * signed-in operator (auth-design.md decision 18 — fleet-service holds no
 * SpaceTraders credential of its own, so an anonymous caller has nothing to
 * read regardless of scope).
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
// jose v5 rather than v6: v6 is ESM-only and this service's Jest setup runs
// CommonJS through ts-jest. See automation-service/src/auth.ts for the full
// story — the same trade applies here unchanged.
import { importSPKI, jwtVerify, type KeyLike } from "jose";

/** The only scope fleet-service enforces — every mutating route needs it. */
export const SCOPE_FLEET_CONTROL = "fleet:control";

const ALGORITHM = "RS256";

export interface AuthConfig {
  clerkJwtKeyPem: string;
  clerkIssuer: string | null;
}

const unauthorized = (res: Response, message: string) =>
  res.status(401).json({ error: { message } });

const forbidden = (res: Response, message: string) =>
  res.status(403).json({ error: { message } });

const bearerFrom = (req: Request): string | null => {
  const header = req.header("Authorization");
  if (header === undefined) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join("");
  return token.length > 0 ? token : null;
};

const scopesFrom = (claim: unknown): string[] => {
  if (typeof claim === "string") return claim.split(/\s+/).filter((s) => s.length > 0);
  if (Array.isArray(claim)) return claim.filter((s): s is string => typeof s === "string");
  return [];
};

export interface Verifier {
  /** Reject unless the caller presents a valid Clerk session carrying `scope`. */
  requireScope(scope: string): RequestHandler;
  /** Reject unless the caller presents a valid Clerk session — any scope. */
  requireSession(): RequestHandler;
}

export function createVerifier(config: AuthConfig): Verifier {
  if (config.clerkJwtKeyPem.length === 0) {
    throw new Error("clerkJwtKeyPem is required — refusing to start without a trust anchor");
  }

  let keyPromise: Promise<KeyLike> | null = null;
  const key = () => {
    keyPromise ??= importSPKI(config.clerkJwtKeyPem, ALGORITHM);
    return keyPromise;
  };

  const verify = (req: Request, res: Response, next: NextFunction, onScopes: (scopes: string[]) => boolean) => {
    const token = bearerFrom(req);
    if (token === null) {
      unauthorized(res, "a bearer token is required");
      return;
    }

    key()
      .then((publicKey) =>
        jwtVerify(token, publicKey, {
          algorithms: [ALGORITHM],
          ...(config.clerkIssuer !== null ? { issuer: config.clerkIssuer } : {}),
        })
      )
      .then(({ payload }) => {
        if (!onScopes(scopesFrom(payload.scope))) {
          forbidden(res, "this action requires a scope this session does not carry");
          return;
        }
        next();
      })
      .catch(() => {
        // Not surfacing jose's specific reason — "expired" vs "bad signature"
        // vs "wrong issuer" is a probing oracle, and the remedy is the same.
        unauthorized(res, "invalid or expired session");
      });
  };

  return {
    requireScope: (scope: string) => (req, res, next) => verify(req, res, next, (scopes) => scopes.includes(scope)),
    requireSession: () => (req, res, next) => verify(req, res, next, () => true),
  };
}
