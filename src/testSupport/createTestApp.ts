/**
 * @file `createApp` with a test trust anchor, and nothing else changed.
 *
 * Same reasoning as automation-service's testSupport/createTestApp.ts: this is
 * a different *key*, not a different code path. Requests still run through
 * the real verifier in auth.ts, still need a real signature and the right
 * scope.
 */

import { createApp } from "../server";
import { TEST_CLERK_JWT_KEY } from "./authTokens";

export const createTestApp = () => createApp({ clerkJwtKeyPem: TEST_CLERK_JWT_KEY, clerkIssuer: null });
