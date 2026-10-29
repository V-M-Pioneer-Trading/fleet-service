# Team rules

How heinzelwerk agents work in this repo. Mode rules (single repo vs workspace) live in the `heinzelwerk:team-modes` skill. This file holds only what is specific to this repo.

- **Autonomy**: full. Agents merge and apply on their own; breakages are learnings. Secrets are never published (name the variable, never the value); the gate never merges its own policy.
- **Backend paths**: `src/` (Express + tsoa controllers `src/controllers/`, tests `src/__tests__/`)
- **Worktree setup** (run once in every new task worktree): `npm ci`
- **Checks** (validator runs every one, in order; copied from CI, quiet flags only):
  - `npm run build`
  - `npm run openapi && test -z "$(git status --porcelain -- openapi.json)"`
  - `npm run lint`
  - `npm test`
  - `npm audit --audit-level=high (red on main: V-M-Pioneer-Trading/meta#136; not in CI)`
  - `docker buildx build --platform linux/arm64 . (unverified locally: docker daemon not running)`
- **Verified against**: 6346b94 2026-10-29 (checks and every ref in this file; retro bumps it)
- **Coding standards**: `eslint.config.mjs:1` (shared `@v-m-pioneer-trading/eslint-config` `base`), `package.json:16` lint with `--max-warnings 0`; plus `CLAUDE.md` "## Invariants" (:47)
- **Risk areas** (validator reviews diffs touching these on Opus). Each entry is a path/glob or a described kind of change, plus why it is risky:
  - Merge to `main` deploys to production (SSM redeploy of fleet-service): `.github/workflows/container.yml:166-185`
  - `src/auth.ts:15,27-28`: access policy is by HTTP method only (GET = any verified session, every other method = `fleet:control`); a new GET route is automatically a read
  - `src/server.ts:45-49,83-84,91,101`: auth is on the router mount, not per route; `GET /health`, `/api/fleet/health`, `/api/fleet/swagger*` are unauthenticated
  - `src/server.ts:56-72`: CORS preflight answered before the guard; its `methods` list must match the router's method policy
  - `POST /ships/{shipSymbol}/navigate`, `/refuel`, `POST /contracts/{contractId}/deliver` spend fuel or credits, and `PATCH /ships/{shipSymbol}/nav` (flight mode; BURN spends extra fuel) `src/controllers/ships.controller.ts:110`, no local spend guard: `src/controllers/ships.controller.ts:43,82`, `src/controllers/contracts.controller.ts:16`; `/refuel` body `fromCargo`, `src/spacetraders/types.ts:29-31`
  - Every SpaceTraders call goes through `spaceTradersRequest` to st-gateway `/proxy` (shared rate budget, injects the game credential); no bare `fetch`, no SpaceTraders base URL: `src/spacetraders/client.ts:64,73`, `docker-compose.yml:9-11`
  - Caller `Authorization` is forwarded to st-gateway (priority lane) and agent-service only: `src/spacetraders/client.ts:76`, `src/controllers/contracts.controller.ts:56`
  - Delivery bookkeeping to agent-service is best-effort; a failure after a successful SpaceTraders deliver is swallowed: `src/controllers/contracts.controller.ts:50-83`
  - Required env `AUTH_INTROSPECTION_URL`/`AUTH_INTROSPECTION_SECRET` set by infra `docker run`; apply the infra stack before deploying an image that needs new env: `../V-M-Pioneer-Trading_infrastructure/fleet-service/main.tf:143`
  - `openapi.json` is generated and synced to meta by CI on main: `.github/workflows/container.yml:227-235`
  - infra paths: always a risk area (`../V-M-Pioneer-Trading_infrastructure/fleet-service/`)
- **Contracts** (see team-modes **Contract changes**; validator checks every diff touching these):
  - API: `openapi.json` (generated from tsoa controllers) = backend spec, synced to meta `../meta/openapi/` · provider backend
  - Provided: `/api/fleet/v1` ship actions and `POST /contracts/{contractId}/deliver` in `src/controllers/ships.controller.ts:21-120`, `src/controllers/contracts.controller.ts:6-16` · consumers command-interface (`../command-interface/src/api/fleetService.ts:23-75`), automation-service (`../automation-service/src/gameClients.ts:344,434`)
  - Consumed: st-gateway `/proxy` from `src/spacetraders/client.ts:73` · provider st-gateway (`../st-gateway/src/server.ts:331`)
  - Consumed: agent-service `POST /contracts/{id}/deliveries` from `src/controllers/contracts.controller.ts:50-65` · provider agent-service (`../agent-service/contract/fixtures/routes.ts:163-167`)
  - Consumed: auth-service introspection via clerk-client, config at startup `src/server.ts:148-151` · provider auth-service
  - Vendored: `src/testSupport/gateway-errors.json`, copy of meta `../meta/fixtures/gateway-errors.json`, NO pin file; NOT byte-verbatim: line 2 `$comment` differs on purpose (`src/testSupport/gateway-errors.json:2` vs `../meta/fixtures/gateway-errors.json:2`), the rest is identical; only the "version" field (:3) and the conformance test's unknown-key check (`src/__tests__/gatewayErrorConformance.test.ts:69-70`) reveal a stale copy · provider meta; a meta change means re-copy everything except line 2
  - Shared packages by release tarball: clerk-client `package.json:20`, eslint-config `package.json:32`
