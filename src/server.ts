import { ValidateError } from "@tsoa/runtime";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { RegisterRoutes } from "./generated/routes";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import swaggerSpec from "./generated/swagger.json";
import { UpstreamError } from "./spacetraders/errors";

export const app = express();

app.use(express.json());
app.use(
  cors({
    origin: config.corsAllowedOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

RegisterRoutes(app);

app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`fleet-service listening on port ${config.port}`);
  });
}
