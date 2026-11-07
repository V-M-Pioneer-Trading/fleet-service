// Writes ./openapi.json from tsoa's generated spec: pretty-printed, LF, trailing
// newline, no timestamps. Run via `npm run openapi`.
//
// JSDoc descriptions are copied from the controller sources, which a Windows
// checkout with autocrlf has as CRLF, so line endings inside strings are
// normalised to LF to keep the output identical on every platform.
//
// tsoa mounts controllers at "/" (the real mount, `/api/fleet/v1`, lives in
// server.ts), so its paths are relative. The committed spec carries the mount,
// like agent-service and automation-service, so a client generator gets
// callable URLs. `toAbsolutePaths` is exported so the spec test runs the same
// transform on fresh tsoa output.
const fs = require("fs");
const path = require("path");

const MOUNT = "/api/fleet/v1";

/** Prefix every `paths` key with the mount, keeping key order. */
const toAbsolutePaths = (spec) => ({
  ...spec,
  paths: Object.fromEntries(Object.entries(spec.paths).map(([key, value]) => [MOUNT + key, value])),
});

const lf = (_key, value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value);

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const raw = JSON.parse(fs.readFileSync(path.join(root, "src", "generated", "swagger.json"), "utf8"));
  fs.writeFileSync(path.join(root, "openapi.json"), JSON.stringify(toAbsolutePaths(raw), lf, 2) + "\n");
}

module.exports = { toAbsolutePaths, MOUNT };
