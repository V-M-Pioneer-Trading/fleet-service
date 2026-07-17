export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  // All SpaceTraders calls route through st-gateway's shared rate budget
  // (meta#1/meta#7) instead of hitting SpaceTraders directly.
  gatewayProxyUrl: process.env.ST_GATEWAY_URL ?? "http://localhost:3002",
  agentServiceUrl: process.env.AGENT_SERVICE_URL ?? "http://localhost:8080/api/agent",
  corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000",
};
