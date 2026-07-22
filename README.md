# Fleet Service

Ship action commands (navigate, orbit, dock, extract, survey, refuel, sell, cargo, cooldown)
and contract delivery for the SpaceTraders mining POC.

Stateless — every request routes through `st-gateway`'s shared rate budget (tagged
`interactive`) rather than hitting SpaceTraders directly, and returns its response. No token is
ever stored: the caller's `Authorization: Bearer <token>` header is forwarded as-is, same
pattern as `agent-service` and `navigation-service`.

## Setup

```bash
npm install
npm run build   # generates tsoa spec/routes (src/generated), then compiles TypeScript
npm start
```

Or for iterative development: `npm run dev` (build + start).

The service listens on port `3001` by default.

Swagger UI: http://localhost:3001/api/fleet/swagger

### Environment variables

| Variable            | Default                              | Description |
|---------------------|---------------------------------------|--------------|
| `PORT`               | `3001`                                | HTTP port |
| `ST_GATEWAY_URL`     | `http://localhost:3002`               | st-gateway base URL; all SpaceTraders calls route through its `/proxy` path |
| `AGENT_SERVICE_URL`  | `http://localhost:8080/api/agent/v1`  | agent-service base URL, used to record contract deliveries |
| `CORS_ALLOWED_ORIGIN`| `http://localhost:3000`               | Frontend origin allowed to call this service |

## Endpoints

All routes are mounted under `/api/fleet/v1` and require `Authorization: Bearer <token>`.

- `POST /ships/{shipSymbol}/orbit`
- `POST /ships/{shipSymbol}/dock`
- `POST /ships/{shipSymbol}/navigate` — body `{ waypointSymbol }`
- `POST /ships/{shipSymbol}/extract` — optional body `{ survey }`
- `POST /ships/{shipSymbol}/extract/survey` — body: a `Survey` object from `POST /survey`
- `POST /ships/{shipSymbol}/survey`
- `POST /ships/{shipSymbol}/refuel` — optional body `{ units?, fromCargo? }`
- `POST /ships/{shipSymbol}/sell` — body `{ symbol, units }`
- `POST /ships/purchase` — body `{ shipType, waypointSymbol }`; requires an existing ship of
  yours docked at a waypoint with a shipyard
- `GET  /ships/{shipSymbol}/cooldown`
- `GET  /ships/{shipSymbol}/cargo`
- `POST /contracts/{contractId}/deliver` — body `{ shipSymbol, tradeSymbol, units }`; calls
  SpaceTraders then records the delivery in agent-service (`POST /contracts/{id}/deliveries`).
  If the agent-service call fails, the (already-successful) SpaceTraders result is still
  returned — the failure is only logged.

## Tests

```bash
npm test
```
