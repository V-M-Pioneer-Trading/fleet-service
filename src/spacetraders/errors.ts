/**
 * st-gateway's verdict on one call, carried back to the error handler that has to
 * answer for it.
 *
 * The status and message are the gateway's own wherever the gateway answered at
 * all: it is the only party that talked to SpaceTraders and the only one that can
 * see whether a credential exists, so re-deciding either here would be a guess
 * overwriting a fact. This service classifies exactly one condition itself — "the
 * gateway did not answer me", which is 504 — and keeps 502 for the narrow case of
 * a 2xx it cannot read. See meta's `docs/design/upstream-errors.md`.
 */
export class UpstreamError extends Error {
  statusCode: number;

  /**
   * Pacing signals the gateway forwards on a passed-through 429. Relaying the
   * status without them keeps the news and drops the instructions.
   *
   * Only on a failure: they ride on `UpstreamError`, so a successful call drops
   * them. That is the reactive half of pacing, not the proactive half — a caller
   * learns the budget is spent rather than that it is nearly spent. Carrying
   * them out of a 2xx means threading a header through every controller return,
   * which is a bigger change than this one and nobody is reading them yet.
   */
  headers: Record<string, string>;

  constructor(statusCode: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

/**
 * The pacing headers worth relaying, in the casing the gateway sends them. It
 * forwards exactly these four (`st-gateway/src/server.ts`), and a caller needs
 * them to back off rather than hammer the shared budget.
 */
export const FORWARDED_HEADERS: readonly string[] = [
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];
