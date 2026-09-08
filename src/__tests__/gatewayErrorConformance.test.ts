/**
 * @file The shared upstream-error contract, driven from the vendored fixtures.
 *
 * Every service that calls SpaceTraders through st-gateway must answer these
 * conditions identically — see meta's `docs/design/upstream-errors.md`. The cases
 * live in `src/testSupport/gateway-errors.json`, a verbatim copy of
 * `meta/fixtures/gateway-errors.json`; change meta first, then re-copy.
 *
 * Driven through the app rather than the client, because the contract is about
 * what a caller receives. A 2xx body this service cannot parse never becomes an
 * `UpstreamError` at the call site either — it is thrown one line later — and
 * asserting on the response is the only way to check the whole path.
 */

import request from "supertest";
import fixtures from "../testSupport/gateway-errors.json";
import { bearer } from "../testSupport/authTokens";
import { createTestApp } from "../testSupport/createTestApp";

interface GatewayResponse {
  transport?: string;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  bodyRepeat?: { chunk: string; times: number };
}

interface Expectation {
  status?: number;
  message?: string;
  messageContains?: string;
  messageNotEmpty?: boolean;
  messageMaxLength?: number;
  headers?: Record<string, string>;
}

/**
 * Every assertion key this test can check. An unrecognised one fails the case
 * rather than being skipped: when meta adds a key, a copy that does not
 * understand it would otherwise quietly degrade to a status-only test and go on
 * reporting green — a conformance suite that stops conforming without saying so.
 */
const KNOWN_EXPECTATIONS = new Set([
  "status",
  "message",
  "messageContains",
  "messageNotEmpty",
  "messageMaxLength",
  "headers",
]);

const cases = fixtures.cases as { name: string; gateway: GatewayResponse; expect: Expectation }[];

describe("the shared upstream-error contract", () => {
  const app = createTestApp();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // A silently empty fixture file would make this whole suite pass on nothing.
  it("drives the whole contract, not a subset of it", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", async (_name, testCase) => {
    const unknown = Object.keys(testCase.expect).filter((key) => !KNOWN_EXPECTATIONS.has(key));
    expect(unknown).toEqual([]);
    expect(testCase.expect.status).toBeDefined();

    const gateway = testCase.gateway;
    if (gateway.transport === "no-response") {
      // The gateway never spoke — the one condition this service is entitled to
      // classify itself.
      global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;
    } else {
      const body =
        gateway.bodyRepeat !== undefined
          ? gateway.bodyRepeat.chunk.repeat(gateway.bodyRepeat.times)
          : (gateway.body ?? "");
      global.fetch = jest.fn().mockResolvedValue({
        ok: (gateway.status ?? 0) < 400,
        status: gateway.status,
        headers: new Headers(gateway.headers ?? {}),
        text: async () => body,
      }) as unknown as typeof fetch;
    }

    const res = await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("Authorization", bearer());

    expect(res.status).toBe(testCase.expect.status);

    const message = res.body?.error?.message ?? "";
    if (testCase.expect.message !== undefined) {
      // Exact: the caller needs the upstream's own sentence unaltered, so that
      // matching on it downstream means the same thing whoever relayed it.
      expect(message).toBe(testCase.expect.message);
    }
    if (testCase.expect.messageContains !== undefined) {
      expect(message).toContain(testCase.expect.messageContains);
    }
    if (testCase.expect.messageNotEmpty === true) {
      expect(message.trim()).not.toBe("");
    }
    if (testCase.expect.messageMaxLength !== undefined) {
      expect([...message].length).toBeLessThanOrEqual(testCase.expect.messageMaxLength);
    }
    for (const [name, value] of Object.entries(testCase.expect.headers ?? {})) {
      expect(res.headers[name.toLowerCase()]).toBe(value);
    }
  });
});
