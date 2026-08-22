import { ValidateError } from "@tsoa/runtime";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { config, requireClerkJwtKey } from "./config";
import { createVerifier, SCOPE_FLEET_CONTROL, type AuthConfig } from "./auth";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { RegisterRoutes } from "./generated/routes";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import swaggerSpec from "./generated/swagger.json";
import { UpstreamError } from "./spacetraders/errors";

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
      methods: ["GET", "POST", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Priority", "X-SpaceTraders-Token"],
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

  const apiRouter = express.Router();
  // Every route here is either a mutation (needs fleet:control) or one of the
  // two reads, cooldown/cargo (needs only a signed-in operator — no scope,
  // auth-design.md decision 18: fleet-service holds no SpaceTraders credential
  // of its own, so an anonymous caller has nothing to read regardless of
  // scope). The split tracks HTTP method exactly: every GET here is a read,
  // everything else mutates.
  apiRouter.use((req, res, next) => (req.method === "GET" ? requireSession() : requireControl)(req, res, next));
  RegisterRoutes(apiRouter);
  app.use("/api/fleet/v1", apiRouter);

  app.use("/api/fleet/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // tsoa's generated routes forward controller/validation errors to next(err) — map each to a
  // proper status instead of letting Express fall through to a bare 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidateError) {
      res.status(400).json({ error: "validation failed", fields: err.fields });
      return;
    }
    if (err instanceof UpstreamError) {
      const status = err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 502;
      res.status(status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

if (require.main === module) {
  const app = createApp({ clerkJwtKeyPem: requireClerkJwtKey(), clerkIssuer: config.clerkIssuer });
  app.listen(config.port, () => {
    console.log(`fleet-service listening on port ${config.port}`);
  });
}
