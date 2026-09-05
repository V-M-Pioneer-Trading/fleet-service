# CLAUDE.md — fleet-service

Contributor and agent notes. The README explains what the service is and why;
this file is the stuff you need to change it without breaking something.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what the lockfile pins |
| `npm run build` | `tsoa spec-and-routes` → `src/generated/`, then `tsc` → `dist/` |
| `npm start` | `node dist/server.js`. Needs a build first |
| `npm run dev` | build + start |
| `npm test` | `pretest` runs tsoa codegen, then jest |
| `npx tsc --noEmit` | Typecheck alone. Needs `src/generated/` to exist |
| `npx jest path/to/file.test.ts` | One suite. Skips codegen, so run `npm test` at least once first |
| `docker compose up --build` | Needs `./clerk-jwt-key.pem` to exist |

`src/generated/` is gitignored and regenerated from the controllers. Never edit
it, never import from it outside `server.ts`.

## Module map

| File | Owns | Depends on |
|---|---|---|
| `src/server.ts` | App construction, middleware order, the auth read/mutate split, the error contract, process bootstrap and shutdown | `config`, `auth`, `generated/routes`, `spacetraders/errors` |
| `src/config.ts` | Env parsing and validation; `requireClerkJwtKey()` | `fs` only |
| `src/auth.ts` | Clerk JWT verification, `requireScope` / `requireSession` | `jose` only |
| `src/spacetraders/client.ts` | The single outbound path to st-gateway: path encoding, `Bearer` construction, priority, timeout, error mapping | `config`, `./errors` |
| `src/spacetraders/errors.ts` | `UpstreamError` | nothing |
| `src/spacetraders/types.ts` | Request-body shapes tsoa validates against | nothing |
| `src/controllers/*.controller.ts` | Route declarations. One `spaceTradersRequest` call each | `spacetraders/client`, `spacetraders/types`, (contracts only) `config` |
| `src/testSupport/*` | Ephemeral keypair, signed test tokens, `createTestApp` | `auth`, `server` |

### Dependency rules

- Controllers never import `server.ts` — that is the cycle tsoa's codegen would
  otherwise close (`server` → `generated/routes` → controllers).
- Controllers never call `fetch` for SpaceTraders. Every game call goes through
  `spaceTradersRequest`; that is the only place path encoding, the `Bearer`
  header, priority and the timeout are applied.
- `auth.ts` imports no config. Its trust anchor is an argument, so a test can
  supply a different key without touching a different code path.
- `testSupport/` is imported only by tests.

## Invariants

Each of these is a rule you can catch a violation of by reading a diff:

1. **The Clerk session is never forwarded upstream.** `Authorization` inbound is
   Clerk's; `Authorization` outbound is built from `X-SpaceTraders-Token`. If a
   controller ever reads the inbound `Authorization`, that is a bug.
2. **Logs are safe to read.** No token is ever stored, logged, or put in an
   error message — grep any new `console.*` for token variables before merging.
   Caller-supplied values are `JSON.stringify`'d into log lines and upstream
   bodies are capped at 500 chars, in the client's `upstreamMessage` and in
   `recordDelivery`: a raw newline in a path param otherwise forges a log line,
   and an upstream HTML error page otherwise becomes kilobytes of log per
   request.
3. **Every caller-supplied path segment is `encodeURIComponent`'d** before it
   reaches an outbound URL — in `shipPath`/`contractPath`, and by hand for the
   agent-service URL in `contracts.controller.ts`. Unencoded, a `..` in a ship
   symbol steers the request at a different gateway route.
4. **Every failure leaves the process with a signal.** Nothing swallows an error
   silently. The one deliberate exception is `recordDelivery`, which logs and
   continues on purpose — see the README.
5. **Every outbound `fetch` carries `signal: AbortSignal.timeout(...)`.** Node's
   fetch has no default timeout; without one a hung upstream pins the request.
6. **Every response body is `{ error: { message } }` or a passed-through
   SpaceTraders success body.** Nothing returns a bare string under `error`.
7. **The service refuses to start without a Clerk key.** Do not add a default,
   a dev bypass, or a "skip auth in test" flag.
8. **Reads are GET/HEAD, mutations are everything else.** The middleware keys on
   the method, not on a route list, so a new GET route is a read automatically.
   A new route that mutates must not be a GET. The `cors()` `methods` list must
   stay in step with what the router accepts, or a browser refuses a preflight
   for a method the server would have served.

## Critical sequences

**Middleware order in `createApp`** — changing it changes behaviour:

1. `app.set("etag", false)` — before any handler, or the health check degrades
   to a bodyless 304 for a client replaying a stale `If-None-Match`.
2. `express.json()` — a malformed body must be rejected before auth spends a
   signature verification on it.
3. `cors()` — must answer preflight before the auth middleware, which would
   401 an `OPTIONS` request that carries no `Authorization`.
4. Health routes — unauthenticated, and before the API router.
5. `/api/fleet/v1` router: read/mutate check, then `RegisterRoutes`.
6. Swagger UI.
7. JSON 404 — after every real mount, or it shadows them.
8. Error handler — last, and the only 4-argument `app.use`.

**Contract delivery** — SpaceTraders first, agent-service second, always in that
order. The game call is the one that can fail meaningfully; recording a delivery
that never happened is worse than losing one that did.

**Startup** — `requireClerkJwtKey()` before `createApp`, so a missing key kills
the process before a port is bound and a health check can pass.

**Shutdown** — `server.close()`, then `closeIdleConnections()`, then an unref'd
force-exit timer. All three are needed: `close()` alone waits on keep-alive
sockets, and a request stuck on a slow upstream can hold it past the
orchestrator's SIGKILL grace period, so the clean exit never happens. Signals
are bound with `process.once` so a second SIGTERM terminates rather than
restarting the timer. This block lives under `require.main === module` and is
**not reachable from the test harness** — changes to it are verified by reading.

## Public surface

Things outside this repo depend on. Changing any of them is a coordinated change.

| Identifier | Consumer | Note |
|---|---|---|
| `/api/fleet/v1/*` route paths | command-interface, automation-service | Also the CloudFront path pattern in production |
| `/health`, `/api/fleet/health` | compose healthcheck, ALB/CloudFront | Both must stay; production only routes the prefixed one |
| `X-SpaceTraders-Token` header name | command-interface, automation-service, agent-service | The decision-18 split; also what this service sends agent-service |
| `X-Priority: interactive` | command-interface | st-gateway reads the forwarded value |
| `fleet:control` scope string | Clerk JWT templates | Defined once in `src/auth.ts` as `SCOPE_FLEET_CONTROL` |
| `{ error: { message } }` body | command-interface error rendering | Uniform since the error-contract change; 400s add `error.fields` |
| `POST {AGENT_SERVICE_URL}/contracts/{id}/deliveries` with `{ shipSymbol, tradeSymbol, units }` | agent-service | Outbound contract this service must keep sending |
| `ghcr.io/v-m-pioneer-trading/fleet-service` | SSM bootstrap document `fleet-service-bootstrap-i-011b6b82a9072a385` | Image name is wired into the deploy |

## Domain facts not obvious from the code

- **st-gateway is not optional.** SpaceTraders rate-limits per agent token
  across every service in the fleet, so a direct call from here would spend
  budget the gateway is accounting for. There is deliberately no
  `SPACETRADERS_BASE_URL`.
- **Priority is a two-value ladder, not a number.** st-gateway understands
  `interactive` and `background`. Anything else, including a missing header,
  becomes `background` — a malformed header must never jump the queue ahead of
  the browser.
- **SpaceTraders errors are `{ error: { message, code } }`.** The client lifts
  `message` out; `code` is currently dropped.
- **jose is pinned to v5, not v6.** v6 is ESM-only and ts-jest here runs
  CommonJS. Upgrading means moving the whole test setup to ESM.
- **`extract` and `extract/survey` are separate upstream endpoints.** The first
  takes an optional survey in the body; the second takes a `Survey` as the
  whole body. Both exist because SpaceTraders has both.
- **Clerk's key is a PEM public key, not a JWKS URL.** Verification is
  networkless on purpose: an outage at Clerk must not take the fleet down.

## Testing

- `supertest` against `createTestApp()` — the real app, the real `auth.ts`, a
  per-run RSA keypair from `testSupport/authTokens.ts`. There is no stub
  verifier; a test that needs to get past auth signs a real token.
- `global.fetch` is replaced per test and restored in `afterEach`. **A test that
  mocks `fetch` without restoring it poisons every later test in the file** —
  this is the flake pattern to watch for. Keep the
  `afterEach(() => { global.fetch = originalFetch; })` in any new suite.
- A test that asserts on log output must `jest.spyOn(console, "error")` and
  restore it; `jest.restoreAllMocks()` in `afterEach` covers this.
- `config.test.ts` is the faster harness level: config validation happens before
  any request exists, so it `jest.resetModules()` and re-`require`s the module
  instead of going through HTTP. Restore `process.env` in `afterAll` — Jest
  isolates module registries per file but not the process environment within one.
- Suite is currently 5 files / 39 tests and has no known flakes; it was run 5×
  clean at the last change. If you see an intermittent failure, suspect an
  unrestored `fetch` mock first.
- No test reaches the network. If a new test would, mock `fetch` instead.

## Extending

- **New ship action**: add a method to `ShipsController`, one line calling
  `spaceTradersRequest("POST", shipPath(shipSymbol, "<action>"), ...)`. Do not
  build the path inline. Rebuild so tsoa regenerates routes and the spec, then
  add the route to the README's API table.
- **New request body**: add the interface to `spacetraders/types.ts` and use it
  as the `@Body()` type. `noImplicitAdditionalProperties: "throw-on-extras"` is
  on, so an unexpected field is a 400 — that is intended.
- **New env var**: put it in the `config` object. If it is numeric, use
  `envInt` so it is validated at startup rather than becoming `NaN` at use.
  Then add a row to the README table and, if compose needs it, `docker-compose.yml`.
- **New scope**: define the string in `auth.ts` next to `SCOPE_FLEET_CONTROL`.
  Never write a scope as a literal at a call site.
- **New upstream**: give it a timeout and an `UpstreamError` mapping. Do not add
  a second bare `fetch` call site without both.

---

**Update this file in the same PR as the change it describes.** A module map,
an invariant list and a public-surface table are only worth reading if they are
true; stale ones are worse than none.
