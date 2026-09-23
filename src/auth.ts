/**
 * @file What fleet-service requires of a caller. Not how a token is verified.
 *
 * auth-service is the only component that verifies a Clerk token
 * (auth-design.md decision 21). This service hands the caller's
 * `Authorization` header to it through the shared
 * `@v-m-pioneer-trading/introspection-client` package and compares the answer
 * against the requirement below. There is no local verifier, no key and no
 * fallback to one: a second verification path is what decision 10 forbids.
 */

import type { RequirementResolver } from "@v-m-pioneer-trading/introspection-client";

/** The only scope fleet-service enforces: every mutating route needs it. */
export const SCOPE_FLEET_CONTROL = "fleet:control";

/**
 * The policy for the tsoa-generated router, which has no call site for a
 * per-route declaration, so it is decided by method alone.
 *
 * Reads (cooldown, cargo) need a signed-in operator and no scope
 * (decision 18: fleet-service holds no SpaceTraders credential of its own, so
 * an anonymous caller has nothing to read). Everything else mutates and needs
 * `fleet:control`. The package presents a `HEAD` to this resolver as `GET`, so
 * a `HEAD` is a read, as it was before the migration.
 */
export const fleetRequirement: RequirementResolver = ({ method }) =>
  method === "GET" ? "session" : SCOPE_FLEET_CONTROL;
