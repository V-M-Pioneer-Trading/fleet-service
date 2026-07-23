import request from "supertest";
import { app } from "../server";

describe("health endpoint", () => {
  it("returns 200 ok without requiring a token", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
