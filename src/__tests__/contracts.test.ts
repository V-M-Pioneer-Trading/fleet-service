import request from "supertest";
import { createTestApp } from "../testSupport/createTestApp";
import { bearer } from "../testSupport/authTokens";

describe("contracts controller: deliver", () => {
  const app = createTestApp();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("delivers cargo then records the delivery in agent-service", async () => {
    const fetchMock = jest.fn();
    // 1st call: SpaceTraders deliver-contract
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { contract: { id: "abc" } } }),
    });
    // 2nd call: agent-service internal deliveries endpoint
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "{}",
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/contracts/abc/deliver")
      .set("Authorization", bearer())
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { contract: { id: "abc" } } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/my/contracts/abc/deliver");
    expect(fetchMock.mock.calls[1][0]).toContain("/contracts/abc/deliveries");
  });

  // Same unencoded-interpolation bug as the ship symbol, on both outbound
  // calls: `../../agent` in a contract id walked out of `/proxy/my/contracts/`
  // upstream and out of agent-service's `/contracts/` path as well.
  it("encodes the contract id in both the SpaceTraders and agent-service URLs", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    global.fetch = fetchMock as unknown as typeof fetch;

    await request(app)
      .post(`/api/fleet/v1/contracts/${encodeURIComponent("../../agent")}/deliver`)
      .set("Authorization", bearer())
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/proxy/my/contracts/..%2F..%2Fagent/deliver");
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe("/api/agent/v1/contracts/..%2F..%2Fagent/deliveries");
  });

  it("still returns the successful delivery if recording it in agent-service fails", async () => {
    const fetchMock = jest.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { contract: { id: "abc" } } }),
    });
    fetchMock.mockRejectedValueOnce(new Error("agent-service unreachable"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/contracts/abc/deliver")
      .set("Authorization", bearer())
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { contract: { id: "abc" } } });
  });

  // Old behaviour: contractId went into the log line verbatim, so a caller who
  // put a newline in it forged a second, fake log entry — and the whole
  // agent-service response body was logged, so an HTML error page became
  // kilobytes of log per failed delivery.
  it("escapes the contract id and caps the body when logging an agent-service rejection", async () => {
    const errors: string[] = [];
    jest.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "{}" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "x".repeat(3000) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await request(app)
      .post(`/api/fleet/v1/contracts/${encodeURIComponent("abc\nforged log line")}/deliver`)
      .set("Authorization", bearer())
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    const logged = errors.join("\n");
    expect(logged).toContain(String.raw`"abc\nforged log line"`);
    expect(logged).not.toContain("\nforged log line");
    expect(logged.length).toBeLessThan(700);
  });

  it("does not call agent-service if the SpaceTraders delivery itself fails", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: "no cargo to deliver" } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/v1/contracts/abc/deliver")
      .set("Authorization", bearer())
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
