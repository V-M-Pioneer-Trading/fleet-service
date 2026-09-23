/**
 * @file Test credentials: opaque strings, and what a stub center says of them.
 *
 * fleet-service no longer verifies a token (auth-design.md decision 21), so a
 * test token is not a signed JWT; it is a string the stub center recognises.
 * Two stubs speak the same table:
 *
 * - {@link inProcessIntrospector}, for the controller suites. They replace
 *   `global.fetch` to fake st-gateway and agent-service, and the package calls
 *   the center through that same `fetch`, so a real HTTP center would collide
 *   with their mocks. Only the transport differs: the adapter, the authorizer
 *   and every message are the package's real ones.
 * - `stubCenter.ts`, a real local HTTP center, for the wiring suite.
 */

import type { CenterAnswer, Introspector } from "@v-m-pioneer-trading/introspection-client";
import { SCOPE_FLEET_CONTROL } from "../auth";

export const TEST_ACTOR = "user_2TestOperator";

export const CONTROL_TOKEN = "test-token-fleet-control";
export const SESSION_TOKEN = "test-token-session-no-scope";
export const INACTIVE_TOKEN = "test-token-inactive";

/** What the center answers for a bare token. Anything not listed is inactive. */
export const answerFor = (token: string): CenterAnswer => {
  if (token === CONTROL_TOKEN) {
    return { state: "active", identity: { sub: TEST_ACTOR, kind: "operator", scopes: [SCOPE_FLEET_CONTROL] } };
  }
  if (token === SESSION_TOKEN) {
    return { state: "active", identity: { sub: TEST_ACTOR, kind: "operator", scopes: [] } };
  }
  return { state: "inactive" };
};

export const inProcessIntrospector: Introspector = {
  introspect: async (token: string) => answerFor(token),
};

/** An operator holding `fleet:control`. */
export const bearer = (): string => `Bearer ${CONTROL_TOKEN}`;

/** A signed-in operator who holds no scope at all. */
export const bearerWithoutScope = (): string => `Bearer ${SESSION_TOKEN}`;

/** A token the center answers `{"active": false}` for. */
export const inactiveBearer = (): string => `Bearer ${INACTIVE_TOKEN}`;
