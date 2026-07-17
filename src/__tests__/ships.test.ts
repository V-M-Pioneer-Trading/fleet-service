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
      .post("/api/fleet/ships/TEST-1/orbit")
      .set("Authorization", "Bearer test-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { nav: { status: "IN_ORBIT" } } });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/my/ships/TEST-1/orbit"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes the call through st-gateway's /proxy path tagged interactive, never hitting SpaceTraders directly", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { nav: { status: "IN_ORBIT" } } }),
    }) as unknown as typeof fetch;

    await request(app).post("/api/fleet/ships/TEST-1/orbit").set("Authorization", "Bearer test-token");

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/^http:\/\/localhost:3002\/proxy\/my\/ships\/TEST-1\/orbit$/);
    expect(url).not.toContain("api.spacetraders.io");
    expect(options.headers["X-Priority"]).toBe("interactive");
  });

  it("maps a SpaceTraders 401 to a 401 response instead of crashing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "Token is missing or empty." } }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/ships/TEST-1/orbit")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
  });

  it("rejects requests missing the Authorization header with a 400", async () => {
    const res = await request(app).post("/api/fleet/ships/TEST-1/orbit");

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
      .post("/api/fleet/ships/TEST-1/navigate")
      .set("Authorization", "Bearer test-token")
      .send({ waypointSymbol: "X1-FQ86-B29" });

    expect(res.status).toBe(200);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ waypointSymbol: "X1-FQ86-B29" });
  });
});
