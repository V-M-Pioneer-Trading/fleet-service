# Team rules

How heinzelwerk agents work in this repo. Mode rules (single repo vs workspace) live in the `heinzelwerk:team-modes` skill. This file holds only what is specific to this repo; the workspace is described in V-M-Pioneer-Trading/meta `docs/agents/heinzelwerk/workspace.md`.

- **Autonomy**: full. Agents merge and apply on their own; breakages are learnings. Secrets are never published (name the variable, never the value), and the gate never merges its own policy.
- **Role**: backend
- **Backend paths**: whole repo
- **Worktree setup**: `npm ci`
- **Checks** (validator runs every one, in order; copied from CI, quiet flags only):
  - `npm run build`
  - `npm run openapi && test -z "$(git status --porcelain -- openapi.json)"`
  - `npm run lint`
  - `npm test`
  - `npm audit --audit-level=high` (red on main: V-M-Pioneer-Trading/meta#119)
- **Checks verified on main**: 6346b94 2026-10-27
- **Coding standards**: `CLAUDE.md` and the shared `@v-m-pioneer-trading/eslint-config`
- **Risk areas** (validator reviews diffs touching these on Opus):
  - `src/controllers/ships.controller.ts` (refuel) and `src/controllers/contracts.controller.ts` (deliver): move credits and cargo
  - `src/server.ts` middleware order and `src/auth.ts`: the guard keys on HTTP method; a mutating GET would be session-only
  - `.github/workflows/**`: a merge to `main` deploys or releases
- **Contracts** (see team-modes **Contract changes**; validator checks every diff touching these):
  - API: `openapi.json` (mirrored to meta `openapi/fleet-service.json`) · provider fleet-service
  - `POST /api/agent/v1/contracts/{id}/deliveries` on agent-service · provider agent-service
