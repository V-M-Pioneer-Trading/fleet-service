import request from "supertest";
import { app } from "../server";

describe("health endpoint", () => {
  it.each(["/health", "/api/fleet/health"])(
    "returns 200 ok without requiring a token at %s",
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    }
  );
});
