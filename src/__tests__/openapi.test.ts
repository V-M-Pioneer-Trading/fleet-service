/**
 * @file Guards the committed API spec's shape (meta#170): absolute paths, and a
 * typed success body on every route command-interface calls.
 *
 * It runs the openapi script's own transform on fresh tsoa output, so a stale
 * committed openapi.json cannot mask a regression here; CI's freshness check
 * covers the committed copy. `npx jest <file>` skips `pretest`, which is what
 * regenerates src/generated/swagger.json: run `npx tsoa spec` first or this
 * file reads a stale spec.
 */
import fs from "fs";
import path from "path";
import request from "supertest";
import { createTestApp } from "../testSupport/createTestApp";
import { bearer } from "../testSupport/authTokens";

interface Schema {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
}
interface Operation {
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Partial<Record<string, { content?: Record<string, { schema: Schema }> }>>;
}
interface Spec {
  paths: Partial<Record<string, Partial<Record<string, Operation>>>>;
  components: { schemas: Record<string, Schema> };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the script is untyped CommonJS (it also runs under plain node); an ES import fails tsc with TS7016
const { toAbsolutePaths } = require("../../scripts/write-openapi.cjs") as {
  toAbsolutePaths: (spec: Spec) => Spec;
};

const MOUNT = "/api/fleet/v1";
const fresh = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "generated", "swagger.json"), "utf8")
) as Spec;
const spec = toAbsolutePaths(fresh);

/** The routes command-interface calls: method + absolute path. */
const ROUTES: [string, string][] = [
  ["post", `${MOUNT}/ships/{shipSymbol}/orbit`],
  ["post", `${MOUNT}/ships/{shipSymbol}/dock`],
  ["post", `${MOUNT}/ships/{shipSymbol}/navigate`],
  ["post", `${MOUNT}/ships/{shipSymbol}/extract`],
  ["post", `${MOUNT}/ships/{shipSymbol}/extract/survey`],
  ["post", `${MOUNT}/ships/{shipSymbol}/survey`],
  ["post", `${MOUNT}/ships/{shipSymbol}/refuel`],
  ["get", `${MOUNT}/ships/{shipSymbol}/cooldown`],
  ["get", `${MOUNT}/ships/{shipSymbol}/cargo`],
  ["patch", `${MOUNT}/ships/{shipSymbol}/nav`],
  ["post", `${MOUNT}/ships/{shipSymbol}/transfer`],
  ["post", `${MOUNT}/contracts/{contractId}/deliver`],
];

const FREE_FORM = "#/components/schemas/Record_string.unknown_";

/** Follow $ref chains to a concrete schema. Throws on a free-form record or a combinator. */
const resolve = (schema: Schema | undefined, where: string): Schema => {
  let cur = schema;
  for (let hops = 0; hops < 20; hops++) {
    if (!cur) throw new Error(`${where}: missing schema`);
    if (cur.allOf || cur.oneOf || cur.anyOf) throw new Error(`${where}: allOf/oneOf/anyOf is not checked`);
    if (!cur.$ref) return cur;
    if (cur.$ref === FREE_FORM) throw new Error(`${where}: free-form Record<string, unknown>`);
    cur = spec.components.schemas[cur.$ref.replace("#/components/schemas/", "")];
  }
  throw new Error(`${where}: $ref chain too deep`);
};

/** A schema that says something: a primitive, an enum, an array of such, or an object with named members. */
const assertTyped = (schema: Schema | undefined, where: string): Schema => {
  const s = resolve(schema, where);
  if (s.type === "array") {
    assertTyped(s.items, `${where}[]`);
  } else if (s.type === "object" || s.properties) {
    if (Object.keys(s.properties ?? {}).length === 0) throw new Error(`${where}: object without named members`);
  } else if (!s.type && !s.enum) {
    throw new Error(`${where}: untyped ({})`);
  }
  return s;
};

const successSchema = (method: string, route: string): Schema => {
  const schema = spec.paths[route]?.[method]?.responses["200"]?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`${method} ${route}: no 200 JSON body`);
  return schema;
};

/** Walk `data.surveys[].deposits[].symbol` from the 200 body, requiring every step typed. */
const leaf = (method: string, route: string, dotted: string): Schema => {
  let cur = assertTyped(successSchema(method, route), `${method} ${route}`);
  let where = "body";
  for (const seg of dotted.split(".")) {
    const isArray = seg.endsWith("[]");
    const name = isArray ? seg.slice(0, -2) : seg;
    where += `.${seg}`;
    const prop = cur.properties?.[name];
    if (!prop) throw new Error(`${method} ${route}: no member ${where}`);
    cur = assertTyped(prop, where);
    if (isArray) {
      if (cur.type !== "array") throw new Error(`${where}: not an array`);
      cur = assertTyped(cur.items, `${where}[]`);
    }
  }
  return cur;
};

const isRequired = (parent: Schema, name: string) => (parent.required ?? []).includes(name);

describe("openapi spec", () => {
  it("lists exactly the 12 routes command-interface calls, all under the mount", () => {
    for (const [method, route] of ROUTES) expect(spec.paths[route]?.[method]).toBeDefined();
    const operations = Object.values(spec.paths).flatMap((ops) => Object.keys(ops ?? {}));
    expect(operations).toHaveLength(ROUTES.length);
    for (const key of Object.keys(spec.paths)) expect(key.startsWith(`${MOUNT}/`)).toBe(true);
  });

  describe.each(ROUTES)("%s %s", (method, route) => {
    it("declares a typed success body with a typed data member", () => {
      const body = assertTyped(successSchema(method, route), "body");
      expect(Object.keys(body.properties ?? {})).toContain("data");
      assertTyped(body.properties?.data, "body.data");
    });
  });

  it.each([
    ["get", "ships/{shipSymbol}/cooldown", ["data.shipSymbol", "data.totalSeconds", "data.remainingSeconds"]],
    ["get", "ships/{shipSymbol}/cargo", ["data.capacity", "data.units", "data.inventory"]],
    [
      "post",
      "ships/{shipSymbol}/refuel",
      ["data.transaction.units", "data.fuel.current", "data.cargo.units", "data.agent.credits"],
    ],
    [
      "post",
      "ships/{shipSymbol}/survey",
      [
        "data.surveys[].signature",
        "data.surveys[].symbol",
        "data.surveys[].deposits[].symbol",
        "data.surveys[].expiration",
        "data.surveys[].size",
        "data.cooldown.remainingSeconds",
      ],
    ],
    [
      "patch",
      "ships/{shipSymbol}/nav",
      ["data.nav.status", "data.nav.flightMode", "data.nav.route.destination.symbol", "data.fuel.current"],
    ],
    ["post", "ships/{shipSymbol}/navigate", ["data.nav.status", "data.fuel.consumed.amount"]],
    ["post", "ships/{shipSymbol}/orbit", ["data.nav.status"]],
    ["post", "ships/{shipSymbol}/dock", ["data.nav.status"]],
    [
      "post",
      "ships/{shipSymbol}/extract",
      ["data.extraction.yield.units", "data.cooldown.totalSeconds", "data.cargo.inventory"],
    ],
    ["post", "ships/{shipSymbol}/extract/survey", ["data.extraction.yield.symbol", "data.cooldown.totalSeconds"]],
    ["post", "ships/{shipSymbol}/transfer", ["data.cargo.units"]],
    ["post", "contracts/{contractId}/deliver", ["data.contract.id", "data.cargo.units"]],
  ] as [string, string, string[]][])("%s %s resolves its fields as typed leaves", (method, tail, paths) => {
    for (const p of paths) expect(() => leaf(method, `${MOUNT}/${tail}`, p)).not.toThrow();
  });

  it("requires what command-interface and upstream both guarantee", () => {
    const cooldownRoute = `${MOUNT}/ships/{shipSymbol}/cooldown`;
    expect(isRequired(resolve(successSchema("get", cooldownRoute), "cooldown"), "data")).toBe(true);
    const data = leaf("get", cooldownRoute, "data");
    for (const f of ["shipSymbol", "totalSeconds", "remainingSeconds"]) expect(isRequired(data, f)).toBe(true);

    const cargoRoute = `${MOUNT}/ships/{shipSymbol}/cargo`;
    const cargo = leaf("get", cargoRoute, "data");
    for (const f of ["capacity", "units", "inventory"]) expect(isRequired(cargo, f)).toBe(true);
    const entry = leaf("get", cargoRoute, "data.inventory[]");
    for (const f of ["symbol", "name", "description", "units"]) expect(isRequired(entry, f)).toBe(true);
  });

  it("keeps every request body closed, so extra fields stay a 400", () => {
    for (const [method, route] of ROUTES) {
      const content = spec.paths[route]?.[method]?.requestBody?.content["application/json"];
      if (!content) continue;
      expect(resolve(content.schema, `${method} ${route} request`).additionalProperties).toBe(false);
    }
  });

  it("keeps response-side surveys open (only the request-side Survey is closed)", () => {
    const route = `${MOUNT}/ships/{shipSymbol}/survey`;
    const item = leaf("post", route, "data.surveys[]");
    const deposit = leaf("post", route, "data.surveys[].deposits[]");
    expect(item.additionalProperties).not.toBe(false);
    expect(deposit.additionalProperties).not.toBe(false);
    for (const f of ["signature", "symbol", "deposits", "expiration", "size"]) expect(isRequired(item, f)).toBe(true);
    expect(isRequired(deposit, "symbol")).toBe(true);
  });

  describe("runtime tie", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("serves every operation in the spec (a route the spec lists is not a 404)", async () => {
      const app = createTestApp();
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, headers: new Headers(), text: () => Promise.resolve("{}") });
      for (const [route, ops] of Object.entries(spec.paths)) {
        const url = route.replace(/{[^}]+}/g, "X-1");
        for (const method of Object.keys(ops ?? {}) as ("get" | "post" | "patch")[]) {
          const req = request(app)[method](url).set("Authorization", bearer());
          const res = await (method === "get" ? req : req.send({}));
          expect([method, route, res.status === 404]).toEqual([method, route, false]);
        }
      }
    });
  });
});
