import { ValidateError } from "@tsoa/runtime";
import cors from "cors";
import {
  createExpressAuth,
  loadIntrospectionConfig,
  notFound,
  passthrough,
  secured,
  type ExpressAuth,
} from "@v-m-pioneer-trading/introspection-client";
import express, { ErrorRequestHandler, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { fleetRequirement } from "./auth";
import { RegisterRoutes } from "./generated/routes";
import swaggerSpec from "./generated/swagger.json";
import { FORWARDED_HEADERS, UpstreamError } from "./spacetraders/errors";

/**
 * Every error this service returns has the same shape as SpaceTraders' own —
 * `{ error: { message } }` — so a caller has one thing to read whether the
 * refusal came from authentication here, from request validation, or from
 * the game upstream. Validation failures carry the offending `fields` too.
 */
const errorBody = (message: string, fields?: unknown) => ({
  error: { message, ...(fields !== undefined ? { fields } : {}) },
});

/**
 * body-parser (and anything else using http-errors) reports a caller's fault —
 * a malformed JSON body, an oversized one — as an error carrying its own 4xx
 * `status` and `expose: true`. Recognising that is what keeps a client typo
 * from being reported as a 500 the caller can only retry.
 */
const clientErrorStatus = (err: unknown): number | null => {
  const candidate = err as { status?: unknown; expose?: unknown } | null;
  const status = candidate?.status;
  return typeof status === "number" && status >= 400 && status < 500 && candidate?.expose === true ? status : null;
};

// `auth` is a required argument, so no call site can construct this service
// without deciding what it trusts. Production passes one built from
// loadIntrospectionConfig(); tests pass one wired to a stub center.
//
// The app is secured(): a route registered on it without a declaration as its
// first handler refuses to start. The generated router cannot be secured (its
// routes carry no declarations), so the guard on its mount protects it.
export function createApp(auth: ExpressAuth) {
  const app = secured(express());

  // Every response here is either a live status check or the result of an
  // action against SpaceTraders — none of it is meaningfully cacheable
  app.set("etag", false);

  app.use(passthrough(express.json(), "parses bodies; never answers a request for a resource"));
  app.use(
    passthrough(
      cors({
        origin: config.corsAllowedOrigin,
        // HEAD is here because the router below treats it as a read; without it
        // a browser's preflight for a HEAD carrying Authorization is refused.
        methods: ["GET", "HEAD", "POST", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
        // Pacing headers relayed from st-gateway. None of these is CORS-safelisted,
        // so without this a browser sees the 429 and not the instructions that came
        // with it — the relay would reach the network and stop at the last hop that
        // matters.
        exposedHeaders: [...FORWARDED_HEADERS],
      }),
      "answers CORS preflights; never serves a resource"
    )
  );

  const health = (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok" });
  };
  // Bare for local dev/compose; also mounted under /api/fleet since production
  // CloudFront only routes requests matching a configured path pattern.
  app.get("/health", auth.allowPublic(), health);
  app.get("/api/fleet/health", auth.allowPublic(), health);

  // Every route here is either a mutation (needs fleet:control) or one of the
  // two reads, cooldown/cargo (needs any verified session); see auth.ts. A
  // HEAD reaches the resolver as GET, so it is a read, as it always was here.
  const generatedRouter = express.Router();
  RegisterRoutes(generatedRouter);
  app.use("/api/fleet/v1", auth.guard(fleetRequirement), generatedRouter);

  app.use("/api/fleet/swagger", auth.allowPublic(), swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Express' default 404 is an HTML page; every other answer from this service
  // is JSON, so a mistyped path shouldn't be the one a caller can't parse.
  app.use(
    notFound((_req: Request, res: Response) => {
      res.status(404).json(errorBody("not found"));
    })
  );

  // tsoa's generated routes forward controller/validation errors to next(err) — map each to a
  // proper status instead of letting Express fall through to a bare 500.
  const onError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof ValidateError) {
      res.status(400).json(errorBody("validation failed", err.fields));
      return;
    }
    if (err instanceof UpstreamError) {
      const status = err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 502;
      // An upstream 5xx is an operational event on this side of the call, not
      // a caller mistake — log it rather than only handing it to the client.
      if (status >= 500) console.error(`upstream failure (${status}): ${err.message}`);
      // Guarded because this is the last handler in the chain: anything thrown
      // here escapes to Express's finalhandler, which answers with an HTML 500
      // and breaks the one-error-shape invariant for a header nobody needs.
      try {
        for (const [name, value] of Object.entries(err.headers)) res.set(name, value);
      } catch (headerErr) {
        console.error(`could not relay upstream pacing headers: ${String(headerErr)}`);
      }
      res.status(status).json(errorBody(err.message));
      return;
    }
    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== null) {
      res.status(clientStatus).json(errorBody((err as Error).message));
      return;
    }
    console.error(err);
    res.status(500).json(errorBody("internal server error"));
  };
  app.use(onError);

  return app;
}

if (require.main === module) {
  // Throws, naming the missing variable, before a port is bound: a service
  // that started without the center would answer 503 to every credentialed
  // request and look like an auth outage.
  const app = createApp(createExpressAuth(loadIntrospectionConfig()));
  const server = app.listen(config.port, () => {
    console.log(`fleet-service listening on port ${config.port}`);
  });

  // Containers are stopped with SIGTERM. Without this the process dies mid
  // request and the caller sees a dropped connection instead of a response.
  const shutdown = (signal: string) => {
    console.log(`received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // close() alone waits for every socket to go idle: keep-alive sockets hold
    // it for keepAliveTimeout, and a request stuck on a slow upstream can hold
    // it past the orchestrator's SIGKILL grace period, so the clean exit never
    // gets to happen. Drop the idle ones immediately and bound the rest.
    server.closeIdleConnections();
    setTimeout(() => {
      console.error("shutdown timed out with connections still open, exiting");
      process.exit(1);
    }, 10_000).unref();
  };
  // `once`, not `on`: a second signal should terminate immediately rather than
  // restart the timeout above.
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => shutdown(signal));
}
