# Repo map: V-M-Pioneer-Trading/fleet-service
Verified against 6346b94 2026-10-29.

## Purpose
- Thin authenticated seam: asks auth-service who the caller is, forwards ship actions via st-gateway `/proxy`. No SpaceTraders credential, no state. `README.md:3-7`, `README.md:46-48`

## Layout
- Module map and dependency rules: `CLAUDE.md` "## Module map" (CLAUDE.md:23), "### Dependency rules" (CLAUDE.md:36)
- `src/server.ts`: `createApp(auth)`, middleware order, router mount guard, error contract, bootstrap
- `src/auth.ts`: `SCOPE_FLEET_CONTROL`, `fleetRequirement` (`:15,27-28`)
- `src/config.ts`: env parsing (`:20-30`)
- `src/controllers/ships.controller.ts`, `src/controllers/contracts.controller.ts`: tsoa routes, one `spaceTradersRequest` call each
- `src/spacetraders/client.ts` (outbound path), `src/spacetraders/errors.ts` (`UpstreamError`, `FORWARDED_HEADERS` `:40`), `src/spacetraders/types.ts` (body shapes)
- src/generated/: tsoa output, git-ignored. `tsoa.json:6,13`, `.gitignore:3`
- `src/testSupport/`: tokens, in-process introspector, stub servers, `createTestApp` (`:13`)

## Entry points and auth
- All routes under `/api/fleet/v1`, mounted behind `auth.guard(fleetRequirement)`. `src/server.ts:91`
- Policy by HTTP method: GET = any verified session; every other method = scope `fleet:control`. HEAD counts as GET. `src/auth.ts:24-28`
- `POST /ships/{shipSymbol}/orbit` :25, `/dock` :34, `/navigate` :43, `/extract` :53, `/extract/survey` :63, `/survey` :73, `/refuel` :82, `/transfer` :120; `PATCH /ships/{shipSymbol}/nav` :110 (all `src/controllers/ships.controller.ts`): `fleet:control`
- `POST /contracts/{contractId}/deliver` `src/controllers/contracts.controller.ts:16`: `fleet:control`
- `GET /ships/{shipSymbol}/cooldown` :92, `/cargo` :101 (`src/controllers/ships.controller.ts`): any verified session, no scope
- `openapi.json` has `"security": []` on all ops; auth is the mount guard, not tsoa metadata. `openapi.json:191`
- Required env, refuses to start without: `AUTH_INTROSPECTION_URL`, `AUTH_INTROSPECTION_SECRET`. `src/server.ts:148-151`, `README.md:119-121`

## Unauthenticated routes
- `GET /health`, `GET /api/fleet/health`. `src/server.ts:83-84`
- `GET /api/fleet/swagger`, `/api/fleet/swagger/*`. `src/server.ts:101`
- CORS preflight (OPTIONS) answered by `cors()` before the guard. `src/server.ts:56-72`
- Unknown paths: JSON 404 `{error:{message}}`. `src/server.ts:105-109`

## Money paths
- Only outbound path to the game: `spaceTradersRequest` to `${ST_GATEWAY_URL}/proxy${path}`. `src/spacetraders/client.ts:64,73`
- No local spend guard; rate budget is st-gateway's. `src/config.ts:21-23`
- Fuel/credit moving: navigate `src/controllers/ships.controller.ts:43`; refuel (credits, optional `fromCargo`) `src/controllers/ships.controller.ts:82`, `src/spacetraders/types.ts:29-31`; flight mode `PATCH /ships/{shipSymbol}/nav` (BURN spends extra fuel) `src/controllers/ships.controller.ts:110`
- Cargo moving, no credits: contract deliver `src/controllers/contracts.controller.ts:22-27`; ship-to-ship `POST /ships/{shipSymbol}/transfer` `src/controllers/ships.controller.ts:120,126`. The payout is `fulfill`, owned by agent-service. `../agent-service/src/auth.ts:35`
- Buy/sell are deliberately in agent-service. `README.md:22-24`
- No SpaceTraders base URL by design. `docker-compose.yml:9-11`

## Calls and called by
- Calls st-gateway `/proxy`: `src/spacetraders/client.ts:73`; `../st-gateway/src/server.ts:331`
- Calls auth-service introspection via clerk-client, config at startup. `src/server.ts:148-151`; URL/secret `README.md:86-87`
- Calls agent-service `POST {AGENT_SERVICE_URL}/contracts/{id}/deliveries` `{shipSymbol,tradeSymbol,units}` with caller's Authorization, best-effort, errors only logged. `src/controllers/contracts.controller.ts:50-83`, `src/config.ts:24`; receiver `../agent-service/src/controllers/contracts.controller.ts:75-76`
- Called by command-interface `../command-interface/src/api/fleetService.ts:23-75` (base `../command-interface/src/api/config.ts:7`)
- Called by automation-service `../automation-service/src/gameClients.ts:344,434` (`FLEET_SERVICE_URL` `../automation-service/src/config.ts:184`)
- Vendored `src/testSupport/gateway-errors.json`, copy of `../meta/fixtures/gateway-errors.json`; used by `src/__tests__/gatewayErrorConformance.test.ts:16`
- Shared packages by release tarball: clerk-client v2.0.1 `package.json:20`; eslint-config v1.1.0 `package.json:32`
- Generated: tsoa routes+spec to src/generated/; `openapi.json` written from src/generated/swagger.json `scripts/write-openapi.cjs:11-13`; synced to meta by CI `.github/workflows/container.yml:227-235`

## Persistence
- None: no DB, cache, session, migrations. `README.md:46-48`

## Build, test, run
- Scripts: `build` (tsoa spec-and-routes && tsc), `start`, `dev`, `openapi`, `pretest` (codegen), `test` (jest), `lint` (`--max-warnings 0`). `package.json:10-16`; Node >=24 `package.json:7`
- Lint and `tsc --noEmit` need src/generated/ first; single suite `npx jest <file>` skips codegen. `CLAUDE.md:15-17`
- Docker: `docker compose up --build` (`docker-compose.yml:1-21`); image `Dockerfile:1-16`, `npm ci` `Dockerfile:3-4`
- Docker local run needs auth-service running and `AUTH_INTROSPECTION_SECRET` exported to its value; compose refuses without it. `docker-compose.yml:17-18`, `README.md:123-124`
- Optional env: `PORT` 3001, `ST_GATEWAY_URL`, `AGENT_SERVICE_URL`, `CORS_ALLOWED_ORIGIN`, `UPSTREAM_TIMEOUT_MS` 30000. `src/config.ts:20-30`
- Prod env set in docker run. `../V-M-Pioneer-Trading_infrastructure/fleet-service/main.tf:143`
- Git-ignored: `node_modules/`, `dist/`, src/generated/, `.env`. `./.gitignore:1-4`

## CI and deploy
- `.github/workflows/container.yml`: triggers pull_request, push main, tags `v*`, workflow_dispatch. `:7-13`
- Job `test`: `npm ci`, `npm run build`, openapi up-to-date check (`git status --porcelain -- openapi.json`), `npm run lint`, `npm test`. `.github/workflows/container.yml:43-75`
- Job `docker` (needs test; never PRs): tip-of-main check `.github/workflows/container.yml:110-132`; AWS role `github-actions-ssm-deploy` `:166-171`; SSM send-command `fleet-service-bootstrap-i-011b6b82a9072a385`, 90x10s poll `:181-222`. v* tags and non-tip main runs push a sha image only. `:80-81`
- Job `sync-openapi`: meta `openapi-sync.yml@main`. `.github/workflows/container.yml:227-235`
- Concurrency group `deploy-<repo>` on main, `cancel-in-progress: false`. `:36-38`
- No audit step in CI. `.github/workflows/container.yml:43-75`

## Patterns
- New ship action: one controller method calling `spaceTradersRequest("POST", shipPath(...), authorization, body)`; never inline paths or bare fetch. `src/controllers/ships.controller.ts:30`, `CLAUDE.md` "## Extending" (:193)
- Body types in `src/spacetraders/types.ts:9-46`; unknown field gives 400 (`throw-on-extras`). `tsoa.json:3`
- `app` is `secured(express())`: an undeclared route refuses to start. `src/server.ts:45-49`
- Errors `{error:{message}}`, 400 adds `fields`. `src/server.ts:25-27,113-141`
- Every outbound fetch has `AbortSignal.timeout(config.upstreamTimeoutMs)`; path segments via `encodeURIComponent`. `src/spacetraders/client.ts:13-17,80`
- New scope string only in `src/auth.ts:15`.
- Tests: supertest on `createTestApp` `src/testSupport/createTestApp.ts:13`; restore `global.fetch` in `afterEach`; fetch mocks need `headers: new Headers()`. `CLAUDE.md` "## Testing" (:157)

## Traps
- `src/testSupport/gateway-errors.json` is NOT byte-verbatim: line 2 `$comment` differs from `../meta/fixtures/gateway-errors.json:2` (local says "VENDORED COPY - do not edit here except this line"); no pin file, only `"version": 1` (`src/testSupport/gateway-errors.json:2-3`). (verified 2026-10-29 @ 6346b94: diff of both files with line 2 removed is empty)
- Conformance test fails on unknown expectation keys, so a stale copy shows. `src/__tests__/gatewayErrorConformance.test.ts:69-70`
- Mutation vs read by HTTP method only; a new GET is auto-read; cors `methods` must match. `src/auth.ts:27-28`, `src/server.ts:62`
- Auth is on the router mount, not per route. `src/server.ts:45-47,91`
- Inbound Authorization is forwarded only to st-gateway and agent-service; gateway derives priority from it; no `X-Priority`. `src/spacetraders/client.ts:54-59,76`, `src/controllers/contracts.controller.ts:56`
- `recordDelivery` failure swallowed after a successful SpaceTraders deliver. `src/controllers/contracts.controller.ts:9-15,67-83`
- Health stays 200 when auth-service is down; all API routes 503, no local verifier. `src/server.ts:80-84`, `README.md:103-105`
- Pacing headers relayed and CORS-exposed. `src/server.ts:68,127`, `src/spacetraders/errors.ts:40`
- Controllers must not import `server.ts` (cycle); never import src/generated outside `server.ts`. `CLAUDE.md` "### Dependency rules" (CLAUDE.md:36)
- Infra passes env vars: apply the infra stack before deploying an image needing new ones. `../V-M-Pioneer-Trading_infrastructure/fleet-service/main.tf:143`, `CLAUDE.md:132`
- Update `CLAUDE.md` in the same PR as the change it describes. `CLAUDE.md:212`
