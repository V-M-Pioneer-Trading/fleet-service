import { ValidateError } from "@tsoa/runtime";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { config, requireClerkJwtKey } from "./config";
import { createVerifier, SCOPE_FLEET_CONTROL, type AuthConfig } from "./auth";
import { RegisterRoutes } from "./generated/routes";
import swaggerSpec from "./generated/swagger.json";
import { UpstreamError } from "./spacetraders/errors";

/**
 * Every error this service returns has the same shape as SpaceTraders' own —
 * `{ error: { message } }` — so a caller has one thing to read whether the
 * refusal came from Clerk verification here, from request validation, or from
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

// `auth` is a required argument, ahead of no others here, so no call site can
// construct this service without deciding what it trusts — same reasoning as
// automation-service's createApp.
export function createApp(auth: AuthConfig) {
  const app = express();

  // Every response here is either a live status check or the result of an
  // action against SpaceTraders — none of it is meaningfully cacheable
  app.set("etag", false);

  app.use(express.json());
  app.use(
    cors({
      origin: config.corsAllowedOrigin,
      // HEAD is here because the router below treats it as a read; without it
      // a browser's preflight for a HEAD carrying Authorization is refused.
      methods: ["GET", "HEAD", "POST", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  const health = (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok" });
  };
  // Bare for local dev/compose; also mounted under /api/fleet since production
  // CloudFront only routes requests matching a configured path pattern.
  app.get("/health", health);
  app.get("/api/fleet/health", health);

  const { requireScope, requireSession } = createVerifier(auth);
  const requireControl = requireScope(SCOPE_FLEET_CONTROL);
  const requireSignedIn = requireSession();

  const apiRouter = express.Router();
  // Every route here is either a mutation (needs fleet:control) or one of the
  // two reads, cooldown/cargo (needs only a signed-in operator — no scope,
  // auth-design.md decision 18: fleet-service holds no SpaceTraders credential
  // of its own, so an anonymous caller has nothing to read regardless of
  // scope). The split tracks HTTP method exactly: every GET here is a read,
  // everything else mutates. HEAD counts as a read because Express answers it
  // from the GET handler — treating it as a mutation demanded fleet:control
  // for a body-less version of a route the same session could already GET.
  const isRead = (method: string) => method === "GET" || method === "HEAD";
  apiRouter.use((req, res, next) => (isRead(req.method) ? requireSignedIn : requireControl)(req, res, next));
  RegisterRoutes(apiRouter);
  app.use("/api/fleet/v1", apiRouter);

  app.use("/api/fleet/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Express' default 404 is an HTML page; every other answer from this service
  // is JSON, so a mistyped path shouldn't be the one a caller can't parse.
  app.use((_req: Request, res: Response) => {
    res.status(404).json(errorBody("not found"));
  });

  // tsoa's generated routes forward controller/validation errors to next(err) — map each to a
  // proper status instead of letting Express fall through to a bare 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidateError) {
      res.status(400).json(errorBody("validation failed", err.fields));
      return;
    }
    if (err instanceof UpstreamError) {
      const status = err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 502;
      // An upstream 5xx is an operational event on this side of the call, not
      // a caller mistake — log it rather than only handing it to the client.
      if (status >= 500) console.error(`upstream failure (${status}): ${err.message}`);
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
  });

  return app;
}

if (require.main === module) {
  const app = createApp({ clerkJwtKeyPem: requireClerkJwtKey(), clerkIssuer: config.clerkIssuer });
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
