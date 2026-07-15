import { config } from "../config";
import { UpstreamError } from "./errors";

/**
 * Forwards authHeader as-is to SpaceTraders (never stored), decodes a 2xx JSON body,
 * and throws an UpstreamError for non-2xx responses so callers (controllers) can map
 * it to a matching HTTP status instead of crashing the process.
 */
export async function spaceTradersRequest<T>(
  method: string,
  path: string,
  authHeader: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${config.spaceTradersBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
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
