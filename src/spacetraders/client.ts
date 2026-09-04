import { config } from "../config";
import { UpstreamError } from "./errors";

/**
 * Builds a SpaceTraders path, URL-encoding every caller-supplied segment.
 *
 * Symbols arrive from the URL path and are interpolated into the upstream
 * request, so an unencoded `..` (or `?`, or `#`) in one lets a caller steer
 * the request at a gateway route this service never meant to expose —
 * `/proxy/my/ships/../../agent/orbit` normalises to `/proxy/agent/orbit`.
 * Every path this service sends upstream is built here.
 */
export const shipPath = (shipSymbol: string, action: string): string =>
  `/my/ships/${encodeURIComponent(shipSymbol)}/${action}`;

export const contractPath = (contractId: string, action: string): string =>
  `/my/contracts/${encodeURIComponent(contractId)}/${action}`;

/**
 * Pulls the human-readable reason out of an upstream error body.
 *
 * SpaceTraders (and st-gateway, which passes its bodies through) answers with
 * `{ error: { message, code } }`. Surfacing that message is what makes a 400
 * actionable in the UI; the raw body is the fallback for anything else.
 */
const upstreamMessage = (text: string): string => {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } })?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Not JSON — an HTML error page from a proxy, say. Fall through.
  }
  // Capped: an upstream that answers with a full HTML error page shouldn't
  // have all of it echoed back through this service.
  return text.length > 0 ? text.slice(0, 500) : "upstream request failed";
};

/**
 * Sends one request to SpaceTraders through st-gateway.
 *
 * `spaceTradersToken` is the game credential from the caller's
 * `X-SpaceTraders-Token` header — never stored, and turned into the upstream
 * `Authorization` header here so no call site can get that wire format wrong.
 * The caller's Clerk session, which server.ts has already verified, is a
 * separate credential and is not forwarded.
 *
 * `priority` forwards the caller's own X-Priority declaration through to
 * st-gateway's priority queue (meta#37) — command-interface (browser) sends
 * "interactive", automation-service (autopilot) sends nothing, and anything
 * that isn't exactly "interactive" degrades to "background" so a missing or
 * malformed header never accidentally jumps the queue.
 *
 * Every non-2xx, unreadable, or timed-out response becomes an UpstreamError so
 * server.ts's handler can map it to a status; nothing here fails silently.
 */
export async function spaceTradersRequest<T>(
  method: string,
  path: string,
  spaceTradersToken: string,
  body?: unknown,
  priority?: string
): Promise<T> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${config.gatewayProxyUrl}/proxy${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${spaceTradersToken}`,
        "X-Priority": priority === "interactive" ? "interactive" : "background",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    // Read inside the same guard: a connection dropped mid-body is the same
    // class of failure as one that never connected, and leaves `text` unusable.
    text = await res.text();
  } catch (err) {
    // Unreachable gateway, DNS failure, a truncated body, or the timeout
    // above. 504 rather than a bare 500: the fault is upstream and the caller
    // may retry.
    throw new UpstreamError(504, `st-gateway did not answer ${method} ${path}: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new UpstreamError(res.status, upstreamMessage(text));
  }

  if (text.length === 0) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    // A 2xx whose body isn't JSON means the gateway answered with something
    // this service can't pass on — surfaced as a 502 rather than crashing the
    // request handler with a SyntaxError and reporting a generic 500.
    throw new UpstreamError(502, `st-gateway returned a non-JSON body for ${method} ${path}`);
  }
}
