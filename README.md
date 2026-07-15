# Fleet Service

Ship action commands (navigate, orbit, dock, extract, survey, refuel, sell, cargo, cooldown)
and contract delivery for the SpaceTraders mining POC.

Stateless — every request calls SpaceTraders directly and returns its response. No token is
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

Swagger UI: http://localhost:3001/swagger

### Environment variables

| Variable                | Default                              | Description |
|-------------------------|---------------------------------------|--------------|
| `PORT`                  | `3001`                                | HTTP port |
| `SPACETRADERS_BASE_URL` | `https://api.spacetraders.io/v2`      | SpaceTraders API base URL |
| `AGENT_SERVICE_URL`     | `http://localhost:8081`               | agent-service base URL, used to record contract deliveries |
| `CORS_ALLOWED_ORIGIN`   | `http://localhost:3000`               | Frontend origin allowed to call this service |

## Endpoints

All require `Authorization: Bearer <token>`.

- `POST /ships/{shipSymbol}/orbit`
- `POST /ships/{shipSymbol}/dock`
- `POST /ships/{shipSymbol}/navigate` — body `{ waypointSymbol }`
- `POST /ships/{shipSymbol}/extract` — optional body `{ survey }`
- `POST /ships/{shipSymbol}/extract/survey` — body: a `Survey` object from `POST /survey`
- `POST /ships/{shipSymbol}/survey`
- `POST /ships/{shipSymbol}/refuel` — optional body `{ units?, fromCargo? }`
- `POST /ships/{shipSymbol}/sell` — body `{ symbol, units }`
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
