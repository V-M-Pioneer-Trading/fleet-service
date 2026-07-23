import request from "supertest";
import { app } from "../server";

describe("health endpoint", () => {
  it.each(["/health", "/api/fleet/health"])(
    "returns 200 ok without requiring a token at %s",
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  );

  it("does not emit an ETag, so a client replaying one from an earlier response can't degrade this to a bodyless 304", async () => {
    const res = await request(app).get("/health").set("If-None-Match", 'W/"stale-etag-from-a-previous-poll"');

    expect(res.headers["etag"]).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
