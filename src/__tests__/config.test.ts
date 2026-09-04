/**
 * @file Startup configuration validation.
 *
 * The HTTP harness can't reach this: a bad PORT is decided before any request
 * exists, so these load the config module directly.
 */

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const loadConfig = () => require("../config").config as { port: number; upstreamTimeoutMs: number };

  it("defaults to port 3001 when PORT is unset", () => {
    delete process.env.PORT;
    expect(loadConfig().port).toBe(3001);
  });

  it("reads a valid PORT", () => {
    process.env.PORT = "8081";
    expect(loadConfig().port).toBe(8081);
  });

  // Old behaviour: parseInt("not-a-port") produced NaN, and listen(NaN) binds
  // an arbitrary free port — the service reported itself healthy on an address
  // nothing was routing to, instead of refusing to start.
  it.each(["not-a-port", "0", "-1", "3001.5"])("refuses to start on an invalid PORT (%s)", (value) => {
    process.env.PORT = value;
    expect(loadConfig).toThrow(/PORT must be a positive integer/);
  });

  it("defaults the upstream deadline and rejects an invalid one", () => {
    delete process.env.UPSTREAM_TIMEOUT_MS;
    expect(loadConfig().upstreamTimeoutMs).toBe(30_000);

    jest.resetModules();
    process.env.UPSTREAM_TIMEOUT_MS = "nope";
    expect(loadConfig).toThrow(/UPSTREAM_TIMEOUT_MS must be a positive integer/);
  });
});
