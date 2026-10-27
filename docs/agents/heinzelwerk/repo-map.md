# Repo map: fleet-service

Stateless ship actions (orbit, dock, navigate, survey, extract, refuel, contract deliver). Holds no SpaceTraders credential: forwards the caller's Clerk bearer to st-gateway and agent-service.

| Path | Holds |
|---|---|
| `src/server.ts` | `createApp` (middleware order matters), bootstrap under `require.main` |
| `src/auth.ts` | `fleetRequirement` by method, `SCOPE_FLEET_CONTROL` |
| `src/controllers/` | `ships.controller.ts`, `contracts.controller.ts` (tsoa) |
| `src/spacetraders/client.ts` | `spaceTradersRequest`, the only outbound game path |
| `src/config.ts` | env |
| `src/testSupport/gateway-errors.json` | vendored meta fixture |
| `src/generated/` | tsoa output, gitignored |
| `openapi.json` | committed spec, CI drift-checked |

- Calls: st-gateway `/proxy`, agent-service `POST /contracts/{id}/deliveries` (after the game call; failure only logged), auth-service introspect via clerk-client.
- Called by: command-interface, automation-service.
- No `typecheck` script: `npx tsc --noEmit`.
- CI `container.yml`: `test` (build, openapi freshness, lint, test), `docker` (main: SSM redeploy), `sync-openapi`.

## Reference docs

- `README.md` "API", "Errors", "Authentication": read when adding or changing a ship or contract route, or its error and auth answers.
- `README.md` "Environment variables": read when changing config.
