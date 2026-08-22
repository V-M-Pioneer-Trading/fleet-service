import { readFileSync } from "fs";

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  // All SpaceTraders calls route through st-gateway's shared rate budget
  // (meta#1/meta#7) instead of hitting SpaceTraders directly.
  gatewayProxyUrl: process.env.ST_GATEWAY_URL ?? "http://localhost:3002",
  agentServiceUrl: process.env.AGENT_SERVICE_URL ?? "http://localhost:8080/api/agent/v1",
  corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000",
  // Only Clerk holds the private half of the key requireClerkJwtKey() reads,
  // so this narrows misconfiguration rather than adding a control.
  clerkIssuer: process.env.CLERK_ISSUER ?? null,
};

/**
 * Clerk's public key comes either inline (`CLERK_JWT_KEY`, how production
 * passes it from SSM through the bootstrap script) or as a path
 * (`CLERK_JWT_KEY_FILE`, how compose mounts the local dev key). Neither has a
 * default — a service that can start without a trust anchor is one that can
 * be deployed with authentication silently off.
 *
 * Deliberately **not** eagerly evaluated into the `config` object above: this
 * module is imported by every test file (via `server.ts`), and calling this
 * at import time would make every test require real Clerk env vars. It's
 * called once, explicitly, in `server.ts`'s process bootstrap; tests
 * construct their own `AuthConfig` via `createTestApp` instead.
 */
export const requireClerkJwtKey = (): string => {
  const inline = process.env.CLERK_JWT_KEY;
  if (inline !== undefined && inline !== "") {
    return inline.replace(/\\n/g, "\n");
  }

  const path = process.env.CLERK_JWT_KEY_FILE;
  if (path !== undefined && path !== "") {
    const pem = readFileSync(path, "utf8").trim();
    if (pem === "") throw new Error(`CLERK_JWT_KEY_FILE (${path}) is empty`);
    return pem;
  }

  throw new Error("CLERK_JWT_KEY or CLERK_JWT_KEY_FILE must be set");
};
