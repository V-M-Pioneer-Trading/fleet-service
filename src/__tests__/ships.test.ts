import request from "supertest";
import { createTestApp } from "../testSupport/createTestApp";
import { bearer, bearerWithoutScope, expiredBearer, foreignBearer } from "../testSupport/authTokens";

describe("ships controller", () => {
  const app = createTestApp();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const mockOkFetch = (body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch;
  };

  it("forwards a successful orbit action and returns SpaceTraders' response", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { nav: { status: "IN_ORBIT" } } });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/my/ships/TEST-1/orbit"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("forwards X-SpaceTraders-Token, not the Clerk session, as the SpaceTraders credential", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "the-game-token");

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer the-game-token");
  });

  it("routes the call through st-gateway's /proxy path, never hitting SpaceTraders directly", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token");

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/^http:\/\/localhost:3002\/proxy\/my\/ships\/TEST-1\/orbit$/);
    expect(url).not.toContain("api.spacetraders.io");
  });

  // meta#37: fleet-service used to hardcode X-Priority: interactive on every
  // outbound call, so automation-service's background autopilot traffic
  // jumped st-gateway's queue meant to keep the browser UI responsive. It now
  // forwards whatever the caller (command-interface vs automation-service)
  // itself declared.
  it("forwards the caller's X-Priority: interactive through to st-gateway", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token")
      .set("X-Priority", "interactive");

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["X-Priority"]).toBe("interactive");
  });

  it("degrades a missing or non-interactive X-Priority to background, never defaulting to interactive", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token");
    let [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["X-Priority"]).toBe("background"); // no header at all — automation-service's case

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token")
      .set("X-Priority", "bogus");
    [, options] = (global.fetch as jest.Mock).mock.calls[1];
    expect(options.headers["X-Priority"]).toBe("background"); // anything but exactly "interactive"
  });

  it("maps a SpaceTraders 401 to a 401 response instead of crashing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "Token is missing or empty." } }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "bad-token");

    expect(res.status).toBe(401);
  });

  it("forwards the navigate request body to SpaceTraders", async () => {
    mockOkFetch({ data: { nav: { status: "IN_TRANSIT" } } });

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/navigate")
      .set("Authorization", bearer())
      .set("X-SpaceTraders-Token", "test-token")
      .send({ waypointSymbol: "X1-FQ86-B29" });

    expect(res.status).toBe(200);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ waypointSymbol: "X1-FQ86-B29" });
  });

  describe("Clerk verification", () => {
    it("rejects a mutating route with no Authorization header at all", async () => {
      global.fetch = jest.fn();
      const res = await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects a signed-in session that lacks fleet:control on a mutating route", async () => {
      global.fetch = jest.fn();
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", bearerWithoutScope())
        .set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects an expired session", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", expiredBearer())
        .set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(401);
    });

    it("rejects a token signed by an untrusted key", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", foreignBearer())
        .set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(401);
    });

    it("rejects a request with the game token but no Clerk session in Authorization", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", "Bearer some-spacetraders-token")
        .set("X-SpaceTraders-Token", "x");

      // Well-formed but not a Clerk-signed JWT — jose rejects it during
      // verification the same as any other invalid signature.
      expect(res.status).toBe(401);
    });

    it("accepts a signed-in session with no scope at all on cooldown, a read", async () => {
      mockOkFetch({ data: { expiration: null } });

      const res = await request(app)
        .get("/api/fleet/v1/ships/TEST-1/cooldown")
        .set("Authorization", bearerWithoutScope())
        .set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(200);
    });

    it("rejects cooldown, a read, with no Authorization header", async () => {
      global.fetch = jest.fn();
      const res = await request(app).get("/api/fleet/v1/ships/TEST-1/cooldown").set("X-SpaceTraders-Token", "x");

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
