import { config } from "../config";
import { UpstreamError } from "./errors";

/**
 * Forwards authHeader as-is through st-gateway (never stored), decodes a 2xx JSON
 * body, and throws an UpstreamError for non-2xx responses so callers (controllers)
 * can map it to a matching HTTP status instead of crashing the process.
 *
 * priority forwards the caller's own X-Priority declaration through to
 * st-gateway's priority queue (meta#37) — command-interface (browser) sends
 * "interactive", automation-service (autopilot) sends nothing, and anything
 * that isn't exactly "interactive" degrades to "background" so a missing or
 * malformed header never accidentally jumps the queue.
 */
export async function spaceTradersRequest<T>(
  method: string,
  path: string,
  authHeader: string,
  body?: unknown,
  priority?: string
): Promise<T> {
  const res = await fetch(`${config.gatewayProxyUrl}/proxy${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      "X-Priority": priority === "interactive" ? "interactive" : "background",
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
