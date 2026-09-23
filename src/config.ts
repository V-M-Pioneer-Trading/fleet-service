/**
 * Reads a positive-integer env var, or the fallback when it is unset/empty.
 *
 * Throws on a value that is present but not a positive integer. `parseInt`
 * used to silently turn `PORT=whatever` into `NaN`, which `listen(NaN)` treats
 * as "pick any free port" — the service came up healthy on an address nothing
 * was routing to.
 */
const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
};

export const config = {
  port: envInt("PORT", 3001),
  // All SpaceTraders calls route through st-gateway's shared rate budget
  // (meta#1/meta#7) instead of hitting SpaceTraders directly.
  gatewayProxyUrl: process.env.ST_GATEWAY_URL ?? "http://localhost:3002",
  agentServiceUrl: process.env.AGENT_SERVICE_URL ?? "http://localhost:8080/api/agent/v1",
  corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000",
  // Deadline for every outbound call (st-gateway and agent-service). Without
  // one, a hung upstream holds the caller's request open indefinitely: node's
  // fetch has no default timeout. Generous by default because st-gateway
  // queues background traffic behind interactive traffic.
  upstreamTimeoutMs: envInt("UPSTREAM_TIMEOUT_MS", 30_000),
};
