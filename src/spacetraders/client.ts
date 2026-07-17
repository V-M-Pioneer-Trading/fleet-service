import { config } from "../config";
import { UpstreamError } from "./errors";

/**
 * Forwards authHeader as-is through st-gateway (never stored), decodes a 2xx JSON
 * body, and throws an UpstreamError for non-2xx responses so callers (controllers)
 * can map it to a matching HTTP status instead of crashing the process.
 *
 * Every call here is triggered by a browser request to fleet-service today — there
 * is no background caller yet (that lands with automation-service's ship FSMs) — so
 * all traffic is tagged interactive. Once automation-service calls fleet-service
 * directly, this needs to forward whatever priority the caller declared instead of
 * hardcoding it.
 */
export async function spaceTradersRequest<T>(
  method: string,
  path: string,
  authHeader: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${config.gatewayProxyUrl}/proxy${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      "X-Priority": "interactive",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new UpstreamError(res.status, `${method} ${path}: ${text}`);
  }

  return text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
}
