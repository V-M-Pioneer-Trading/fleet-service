/**
 * @file fleet-service's wiring of the shared introspection client.
 *
 * The package's own conformance suite drives the 35 fixture cases against its
 * client. What it cannot see is how THIS service mounted it: which routes are
 * public, what the generated router requires per method, that HEAD follows
 * GET, and where the caller's credential travels afterwards. Everything here
 * is real HTTP: a stub center, a stub st-gateway and a stub agent-service, and
 * `global.fetch` is never replaced.
 */

import { createExpressAuth, MESSAGES } from "@v-m-pioneer-trading/introspection-client";
import request from "supertest";
import { config } from "../config";
import { createApp } from "../server";
import { CONTROL_TOKEN, INACTIVE_TOKEN, SESSION_TOKEN, WRONG_SCOPE_TOKEN } from "../testSupport/authTokens";
import { startStub, startStubCenter, STUB_SECRET, type Stub } from "../testSupport/stubServers";

describe("introspection wiring", () => {
  let center: Stub;
  let gateway: Stub;
  let agent: Stub;
  const saved = { gateway: config.gatewayProxyUrl, agent: config.agentServiceUrl };
  let logged: string[];

  const appWith = (url: string) => createApp(createExpressAuth({ url, secret: STUB_SECRET }));
  const app = () => appWith(`${center.url}/auth/v1/introspect`);

  beforeAll(async () => {
    center = await startStubCenter();
    gateway = await startStub(() => ({ status: 200, body: { data: { ok: true } } }));
    agent = await startStub(() => ({ status: 500, body: { error: { message: "agent-service fell over" } } }));
    config.gatewayProxyUrl = gateway.url;
    config.agentServiceUrl = `${agent.url}/api/agent/v1`;
  });

  afterAll(async () => {
    config.gatewayProxyUrl = saved.gateway;
    config.agentServiceUrl = saved.agent;
    await Promise.all([center.close(), gateway.close(), agent.close()]);
  });

  beforeEach(() => {
    center.calls.length = 0;
    gateway.calls.length = 0;
    agent.calls.length = 0;
    logged = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? `${a.stack} ${String(a.cause)}` : String(a))).join(" "));
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(["/health", "/api/fleet/health", "/api/fleet/swagger/"])(
    "serves the public GET %s with no header and never asks the center",
    async (path) => {
      const res = await request(app()).get(path);

      expect(res.status).toBe(200);
      expect(center.calls).toHaveLength(0);
    }
  );

  // ignoreCredentials(): these routes never read identity, so a bearer is not
  // verified. Under allowPublic() the inactive token below would be a 401 after
  // one center call, and a down center a 503.
  it.each(["/health", "/api/fleet/health", "/api/fleet/swagger/"])(
    "ignores a bearer on %s: 200, and the center is never asked",
    async (path) => {
      // A valid token too: allowPublic() would serve it 200, so only the call
      // count below tells the two declarations apart for that one.
      for (const header of [`Bearer ${CONTROL_TOKEN}`, `Bearer ${INACTIVE_TOKEN}`, "Bearer not-a-token-at-all", "Bearer abc def"]) {
        const res = await request(app()).get(path).set("Authorization", header);

        expect(res.status).toBe(200);
      }
      expect(center.calls).toHaveLength(0);
    }
  );

  it.each(["/health", "/api/fleet/health", "/api/fleet/swagger/"])(
    "serves %s with a bearer while the center is unreachable",
    async (path) => {
      const down = await startStub(() => ({ status: 200, body: {} }));
      await down.close();

      const res = await request(appWith(`${down.url}/auth/v1/introspect`))
        .get(path)
        .set("Authorization", `Bearer ${CONTROL_TOKEN}`);

      expect(res.status).toBe(200);
    }
  );

  it("answers an unmatched path outside the API with the JSON 404, never asking the center", async () => {
    const res = await request(app()).post("/nowhere").set("Authorization", `Bearer ${CONTROL_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: "not found" } });
    expect(center.calls).toHaveLength(0);
  });

  it("refuses a read with no header, without asking the center", async () => {
    const res = await request(app()).get("/api/fleet/v1/ships/S-1/cooldown");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: MESSAGES.missingToken } });
    expect(center.calls).toHaveLength(0);
    expect(gateway.calls).toHaveLength(0);
  });

  it("refuses a read with an inactive token", async () => {
    const res = await request(app()).get("/api/fleet/v1/ships/S-1/cooldown").set("Authorization", `Bearer ${INACTIVE_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: "invalid or expired session" } });
    expect(center.calls).toHaveLength(1);
    expect(gateway.calls).toHaveLength(0);
  });

  it("serves a read to a session with no scope at all", async () => {
    const res = await request(app()).get("/api/fleet/v1/ships/S-1/cooldown").set("Authorization", `Bearer ${SESSION_TOKEN}`);

    expect(res.status).toBe(200);
    expect(gateway.calls).toHaveLength(1);
  });

  it("refuses a mutation to a session without fleet:control, with the exact message", async () => {
    const res = await request(app()).post("/api/fleet/v1/ships/S-1/orbit").set("Authorization", `Bearer ${SESSION_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { message: "this action requires a scope this session does not carry" } });
    expect(gateway.calls).toHaveLength(0);
  });

  it("refuses a mutation to a session holding only a neighbouring scope", async () => {
    const res = await request(app()).post("/api/fleet/v1/ships/S-1/orbit").set("Authorization", `Bearer ${WRONG_SCOPE_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { message: "this action requires a scope this session does not carry" } });
    expect(gateway.calls).toHaveLength(0);
  });

  it("serves GET-only swagger: any other method falls through to the JSON 404", async () => {
    const res = await request(app()).post("/api/fleet/swagger/");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: "not found" } });
  });

  it("answers a POST to swagger carrying a bearer with the JSON 404, never asking the center", async () => {
    const res = await request(app()).post("/api/fleet/swagger/").set("Authorization", `Bearer ${CONTROL_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: "not found" } });
    expect(center.calls).toHaveLength(0);
  });

  it("still serves swagger-ui static assets under the GET-only mount", async () => {
    const res = await request(app()).get("/api/fleet/swagger/swagger-ui.css");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it.each(["post:/api/fleet/v1/ships/S-1/orbit", "patch:/api/fleet/v1/ships/S-1/nav"])(
    "lets a session holding fleet:control through %s, asking the center exactly once",
    async (spec) => {
      const [method, path] = spec.split(":") as ["post" | "patch", string];
      const body = method === "patch" ? { flightMode: "CRUISE" } : undefined;
      const res = await request(app())[method](path).set("Authorization", `Bearer ${CONTROL_TOKEN}`).send(body);

      expect(res.status).toBe(200);
      expect(gateway.calls).toHaveLength(1);
      expect(center.calls).toHaveLength(1);
      const [asked] = center.calls;
      expect(asked.method).toBe("POST");
      expect(asked.url).toBe("/auth/v1/introspect");
      expect(asked.headers["x-introspection-secret"]).toBe(STUB_SECRET);
      expect(new URLSearchParams(asked.body).get("token")).toBe(CONTROL_TOKEN);
    }
  );

  it("answers 503 when the center cannot be reached, and never serves the route", async () => {
    const down = await startStub(() => ({ status: 200, body: {} }));
    await down.close();

    const res = await request(appWith(`${down.url}/auth/v1/introspect`))
      .post("/api/fleet/v1/ships/S-1/orbit")
      .set("Authorization", `Bearer ${CONTROL_TOKEN}`);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: { message: "the authentication service could not process this request" } });
    expect(gateway.calls).toHaveLength(0);
  });

  it.each(["Bearer abc def", "Bearer ", "Bearer"])(
    "reads %j as no credential: 401, and the center is never asked",
    async (header) => {
      const res = await request(app()).post("/api/fleet/v1/ships/S-1/orbit").set("Authorization", header);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { message: MESSAGES.missingToken } });
      expect(center.calls).toHaveLength(0);
    }
  );

  describe("HEAD follows GET", () => {
    it("serves HEAD on a read to a session with no scope", async () => {
      const res = await request(app()).head("/api/fleet/v1/ships/S-1/cargo").set("Authorization", `Bearer ${SESSION_TOKEN}`);

      expect(res.status).toBe(200);
    });

    it("refuses HEAD with no header, without asking the center", async () => {
      const res = await request(app()).head("/api/fleet/v1/ships/S-1/cargo");

      expect(res.status).toBe(401);
      expect(center.calls).toHaveLength(0);
    });

    it("refuses HEAD with an inactive token", async () => {
      const res = await request(app()).head("/api/fleet/v1/ships/S-1/cargo").set("Authorization", `Bearer ${INACTIVE_TOKEN}`);

      expect(res.status).toBe(401);
      expect(center.calls).toHaveLength(1);
      // A HEAD answer carries no body on the wire, so the message is pinned by
      // the Content-Length the handler computed for the JSON it would send.
      const expected = JSON.stringify({ error: { message: "invalid or expired session" } });
      expect(res.headers["content-length"]).toBe(String(Buffer.byteLength(expected)));
    });
  });

  describe("where the caller's credential goes", () => {
    // Lower-case scheme on purpose: the package accepts it, so only a verbatim
    // forward (not a re-assembled `Bearer ${token}`) passes the equality below.
    const header = `bearer ${CONTROL_TOKEN}`;

    const deliver = () =>
      request(app())
        .post("/api/fleet/v1/contracts/C-1/deliver")
        .set("Authorization", header)
        .send({ shipSymbol: "S-1", tradeSymbol: "IRON_ORE", units: 20 });

    it("forwards it verbatim on the agent-service deliveries call", async () => {
      const res = await deliver();

      expect(res.status).toBe(200);
      expect(agent.calls).toHaveLength(1);
      expect(agent.calls[0].url).toBe("/api/agent/v1/contracts/C-1/deliveries");
      expect(agent.calls[0].headers.authorization).toBe(header);
    });

    it("sends it to st-gateway, agent-service and the center (as a form field) and nowhere else, logging none of it", async () => {
      await deliver();

      // The only outbound requests this delivery made.
      expect(gateway.calls).toHaveLength(1);
      expect(agent.calls).toHaveLength(1);
      expect(center.calls).toHaveLength(1);
      expect(gateway.calls[0].headers.authorization).toBe(header);
      // The center gets the token in the body, never as a header or in a URL.
      expect(center.calls[0].headers.authorization).toBeUndefined();
      expect(center.calls[0].url).not.toContain(CONTROL_TOKEN);
      // No other request header or URL on any outbound call carries it.
      for (const call of [...gateway.calls, ...agent.calls, ...center.calls]) {
        const { authorization: _auth, ...rest } = call.headers;
        expect(JSON.stringify(rest)).not.toContain(CONTROL_TOKEN);
        expect(call.url).not.toContain(CONTROL_TOKEN);
      }
      // The agent stub answered 500, so the rejection path logged. Not the token.
      expect(logged.join("\n")).toContain("agent-service rejected delivery record");
      expect(logged.join("\n")).not.toContain(CONTROL_TOKEN);
    });

    it("logs no token when agent-service cannot be reached either", async () => {
      const saved = config.agentServiceUrl;
      const down = await startStub(() => ({ status: 200, body: {} }));
      await down.close();
      config.agentServiceUrl = `${down.url}/api/agent/v1`;
      try {
        const res = await deliver();
        expect(res.status).toBe(200);
      } finally {
        config.agentServiceUrl = saved;
      }

      expect(logged.join("\n")).toContain("failed to reach agent-service");
      expect(logged.join("\n")).not.toContain(CONTROL_TOKEN);
    });
  });
});
