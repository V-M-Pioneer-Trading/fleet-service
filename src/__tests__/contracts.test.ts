import request from "supertest";
import { app } from "../server";

describe("contracts controller: deliver", () => {
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
      .post("/api/fleet/contracts/abc/deliver")
      .set("Authorization", "Bearer test-token")
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { contract: { id: "abc" } } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/my/contracts/abc/deliver");
    expect(fetchMock.mock.calls[1][0]).toContain("/contracts/abc/deliveries");
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
      .post("/api/fleet/contracts/abc/deliver")
      .set("Authorization", "Bearer test-token")
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { contract: { id: "abc" } } });
  });

  it("does not call agent-service if the SpaceTraders delivery itself fails", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: "no cargo to deliver" } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/fleet/contracts/abc/deliver")
      .set("Authorization", "Bearer test-token")
      .send({ shipSymbol: "TEST-1", tradeSymbol: "IRON_ORE", units: 20 });

    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
