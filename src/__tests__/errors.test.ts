/**
 * @file The error contract: what a caller gets back when something goes wrong.
 *
 * Every case here used to surface as a bare `500 internal server error` (or an
 * HTML page), which told the caller nothing about whether to fix the request
 * or retry it.
 */

import request from "supertest";
import { createTestApp } from "../testSupport/createTestApp";
import { bearer } from "../testSupport/authTokens";

describe("error contract", () => {
  const app = createTestApp();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const mockFetch = (impl: unknown) => {
    global.fetch = impl as unknown as typeof fetch;
  };

  // Old behaviour: body-parser's SyntaxError fell through to the catch-all
  // handler, so a malformed JSON body came back as 500 "internal server
  // error" — an unretryable-looking server fault for a caller-side typo.
  it("answers a malformed JSON body with 400, not 500", async () => {
    mockFetch(jest.fn());

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/navigate")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "t")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Old behaviour: no 404 handler, so Express served its default HTML error
  // page from a service whose every other response is JSON.
  it("answers an unknown route with a JSON 404", async () => {
    const res = await request(app).get("/api/fleet/v1/no-such-route").set("Authorization", bearer());

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { message: "not found" } });
  });

  // Old behaviour: JSON.parse ran unguarded on any 2xx body, so a gateway
  // answering 200 with an HTML error page threw a SyntaxError inside the
  // controller and the caller was told the fault was here, as a 500.
  it("answers a non-JSON 2xx from st-gateway with 502", async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>gateway</html>" }));

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "t");

    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/non-JSON/);
  });

  // Old behaviour: a rejected fetch (gateway down, DNS failure, and — since
  // node's fetch has no default timeout — a hang that never resolved at all)
  // propagated as an unrecognised error and became a 500.
  it("answers an unreachable st-gateway with 504", async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "t");

    expect(res.status).toBe(504);
    expect(res.body.error.message).toMatch(/st-gateway did not answer/);
  });

  it("passes an outbound abort deadline to st-gateway so a hung upstream can't hold the request open", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    mockFetch(fetchMock);

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "t");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  // Old behaviour: the upstream body was wrapped as `POST /my/ships/...: {"error":
  // {"message":"Ship is not docked"}}` and returned under a *flat* `error`
  // string, while auth failures from the same service used a nested
  // `{ error: { message } }`. A caller had two shapes to handle and the actual
  // game reason was buried inside a stringified body.
  it("surfaces the upstream message under the same { error: { message } } shape as an auth failure", async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: "Ship is not currently docked.", code: 4214 } }),
      })
    );

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "t");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: "Ship is not currently docked." } });

    const unauthorized = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("X-SpaceTraders-Token", "t");
    expect(Object.keys(unauthorized.body)).toEqual(Object.keys(res.body));
    expect(typeof unauthorized.body.error.message).toBe("string");
  });

  // Old behaviour: the router treated HEAD as a read but CORS advertised only
  // GET/POST/PATCH, so a browser's preflight for a HEAD carrying Authorization
  // was refused by the browser even though the server would have served it.
  it("advertises HEAD in Access-Control-Allow-Methods, matching what the router allows", async () => {
    const res = await request(app)
      .options("/api/fleet/v1/ships/TEST-1/cooldown")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "HEAD")
      .set("Access-Control-Request-Headers", "authorization,x-spacetraders-token");

    expect(res.headers["access-control-allow-methods"].split(",")).toContain("HEAD");
  });

  it("reports a validation failure in that same shape, with the offending fields", async () => {
    const res = await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("Authorization", bearer());

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("validation failed");
    expect(res.body.error.fields).toHaveProperty("X-SpaceTraders-Token");
  });
});
