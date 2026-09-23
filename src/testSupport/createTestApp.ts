/**
 * @file `createApp` with a stub center, and nothing else changed.
 *
 * Requests still run through the package's real Express adapter and
 * authorizer; only the center's transport is in-process (see authTokens.ts for
 * why). The wiring suite builds its app against a real HTTP stub instead.
 */

import { createExpressAuth } from "@v-m-pioneer-trading/introspection-client";
import { createApp } from "../server";
import { inProcessIntrospector } from "./authTokens";

export const createTestApp = () => createApp(createExpressAuth(inProcessIntrospector));
