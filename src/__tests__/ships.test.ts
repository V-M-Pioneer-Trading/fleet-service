import request from "supertest";
import { app } from "../server";

describe("ships controller", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("forwards a successful orbit action and returns SpaceTraders' response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_ORBIT" } } }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { nav: { status: "IN_ORBIT" } } });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/my/ships/TEST-1/orbit"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes the call through st-gateway's /proxy path, never hitting SpaceTraders directly", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_ORBIT" } } }),
    }) as unknown as typeof fetch;

    await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("Authorization", "Bearer test-token");

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_ORBIT" } } }),
    }) as unknown as typeof fetch;

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", "Bearer test-token")
      .set("X-Priority", "interactive");

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["X-Priority"]).toBe("interactive");
  });

  it("degrades a missing or non-interactive X-Priority to background, never defaulting to interactive", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_ORBIT" } } }),
    }) as unknown as typeof fetch;

    await request(app).post("/api/fleet/v1/ships/TEST-1/orbit").set("Authorization", "Bearer test-token");
    let [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["X-Priority"]).toBe("background"); // no header at all — automation-service's case

    await request(app)
      .post("/api/fleet/v1/ships/TEST-1/orbit")
      .set("Authorization", "Bearer test-token")
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
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
  });

  it("rejects requests missing the Authorization header with a 400", async () => {
    const res = await request(app).post("/api/fleet/v1/ships/TEST-1/orbit");

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("Authorization");
  });

  it("forwards the navigate request body to SpaceTraders", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_TRANSIT" } } }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/ships/TEST-1/navigate")
      .set("Authorization", "Bearer test-token")
      .send({ waypointSymbol: "X1-FQ86-B29" });

    expect(res.status).toBe(200);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ waypointSymbol: "X1-FQ86-B29" });
  });
});
