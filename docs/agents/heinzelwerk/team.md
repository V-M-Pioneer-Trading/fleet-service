# Team rules

How heinzelwerk agents work in this repo. Mode rules (single repo vs workspace) live in the `heinzelwerk:team-modes` skill. This file holds only what is specific to this repo.

- **Role**: backend (Node / TS / Express / tsoa). Stateless ship actions
- **Backend paths**: `src/`, `scripts/`, `Dockerfile`, `docker-compose.yml`
- **Shared paths** (only the owner named in the task edits them): `openapi.json`, `src/testSupport/gateway-errors.json`
- **Worktree setup**: `npm ci --no-audit --no-fund`
- **Checks** (validator runs every one, in order):
  1. `npm audit --audit-level=high`
  2. `npm run build --silent`
  3. `npx tsc --noEmit`
  4. `npm run openapi --silent && git diff --exit-code openapi.json`
  5. `npm run lint --silent`
  6. `npm test --silent -- --silent`
- **Security**: no secret scan runs yet: gitleaks is not installed and no pre-commit hook exists (planned: `gitleaks git --pre-commit --staged` in `.git/hooks/pre-commit`), so check every diff for secrets by eye · dependency audit in checks
- **Coding standards**: `CLAUDE.md` in this repo; lint rules come from `@v-m-pioneer-trading/eslint-config` and change only by a release of that package
- **Risk areas** (validator reviews diffs touching these on Opus):
  - `src/auth.ts` (`fleetRequirement`, scopes): a mutating GET, or a mutation without `fleet:control`, is a hole
  - `createApp` middleware order in `src/server.ts`
  - `src/spacetraders/client.ts`: the bearer reaches only st-gateway and agent-service, never a log
  - route paths: CloudFront path and public surface listed in `CLAUDE.md`
  - `.github/workflows/`: push to main deploys production
- **Contracts**:
  - `openapi.json`: provider this repo; CI diffs it; meta's copy synced by bot. Consumers: command-interface, automation-service
  - consumer of agent-service `POST /contracts/{id}/deliveries`
  - `meta/fixtures/gateway-errors.json`, vendored in `src/testSupport/`: provider meta; change meta first, then re-vendor
  - `@v-m-pioneer-trading/eslint-config`, `@v-m-pioneer-trading/clerk-client`: consumed by release-tarball URL, so a change is a version bump here
