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
      .set("Authorization", bearer());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { nav: { status: "IN_ORBIT" } } });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/my/ships/TEST-1/orbit"),
      expect.objectContaining({ method: "POST" })
    );
  });

  // auth-design.md decisions 2 and 5: no game credential passes through this
  // service (st-gateway injects it), and the caller's own Clerk session is
  // forwarded verbatim so st-gateway can derive queue priority from a verified
  // identity — a human session earns the interactive lane there.
  it("forwards the caller's Clerk session, verbatim, as the upstream Authorization", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });
    const session = bearer();

    await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("Authorization", session);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe(session);
    expect(options.headers).not.toHaveProperty("X-Priority");
    expect(options.headers).not.toHaveProperty("X-SpaceTraders-Token");
  });

  // Stage 5 of increment 3 removed the game-token header. A stale caller still
  // sending it is served normally — st-gateway overwrites the credential
  // anyway, so rejecting would only create a deploy-ordering trap.
  it("ignores a stray X-SpaceTraders-Token header rather than rejecting it", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer());

    expect(res.status).toBe(200);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers).not.toHaveProperty("X-SpaceTraders-Token");
  });

  it("routes the call through st-gateway's /proxy path, never hitting SpaceTraders directly", async () => {
    mockOkFetch({ data: { nav: { status: "IN_ORBIT" } } });

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer());

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/^http:\/\/localhost:3002\/proxy\/my\/ships\/TEST-1\/orbit$/);
    expect(url).not.toContain("api.spacetraders.io");
  });

  // A ship symbol arrives in the URL path and used to be interpolated into the
  // upstream path unencoded, so `../../agent` walked out of `/proxy/my/ships/`
  // — node's URL parser normalised the result to `http://localhost:3002/proxy/agent/orbit`,
  // letting any caller with fleet:control aim this service at gateway routes it
  // never meant to expose.
  it("encodes the ship symbol so it cannot escape the upstream path", async () => {
    mockOkFetch({ data: {} });

    await request(app)
      .post(`/api/fleet/v1/ships/${encodeURIComponent("../../agent")}/orbit`)
      .set("Authorization", bearer());

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe("/proxy/my/ships/..%2F..%2Fagent/orbit");
  });

  it("maps a SpaceTraders 401 to a 401 response instead of crashing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => JSON.stringify({ error: { message: "Token is missing or empty." } }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", bearer());

    expect(res.status).toBe(401);
  });

  it("forwards the navigate request body to SpaceTraders", async () => {
    mockOkFetch({ data: { nav: { status: "IN_TRANSIT" } } });

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/navigate")
      .set("Authorization", bearer())
      .send({ waypointSymbol: "X1-FQ86-B29" });

    expect(res.status).toBe(200);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ waypointSymbol: "X1-FQ86-B29" });
  });

  describe("Clerk verification", () => {
    it("rejects a mutating route with no Authorization header at all", async () => {
      global.fetch = jest.fn();
      const res = await request(app).post("/api/fleet/v1/ships/TEST-1/orbit");

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects a signed-in session that lacks fleet:control on a mutating route", async () => {
      global.fetch = jest.fn();
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", bearerWithoutScope());

      expect(res.status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects an expired session", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", expiredBearer());

      expect(res.status).toBe(401);
    });

    it("rejects a token signed by an untrusted key", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", foreignBearer());

      expect(res.status).toBe(401);
    });

    it("rejects a request with the game token but no Clerk session in Authorization", async () => {
      const res = await request(app)
        .post("/api/fleet/v1/ships/TEST-1/orbit")
        .set("Authorization", "Bearer some-spacetraders-token");

      // Well-formed but not a Clerk-signed JWT — jose rejects it during
      // verification the same as any other invalid signature.
      expect(res.status).toBe(401);
    });

    it("accepts a signed-in session with no scope at all on cooldown, a read", async () => {
      mockOkFetch({ data: { expiration: null } });

      const res = await request(app)
        .get("/api/fleet/v1/ships/TEST-1/cooldown")
        .set("Authorization", bearerWithoutScope());

      expect(res.status).toBe(200);
    });

    // Old behaviour: the read/mutate split keyed on `req.method === "GET"`
    // alone, so HEAD — which Express answers from the same GET handler —
    // demanded fleet:control for a body-less version of a route the very same
    // session could already GET.
    it("treats HEAD on a read as a read, not a mutation", async () => {
      mockOkFetch({ data: { expiration: null } });

      const res = await request(app)
        .head("/api/fleet/v1/ships/TEST-1/cooldown")
        .set("Authorization", bearerWithoutScope());

      expect(res.status).toBe(200);
    });

    it("rejects cooldown, a read, with no Authorization header", async () => {
      global.fetch = jest.fn();
      const res = await request(app).get("/api/fleet/v1/ships/TEST-1/cooldown");

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
