export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  spaceTradersBaseUrl: process.env.SPACETRADERS_BASE_URL ?? "https://api.spacetraders.io/v2",
  agentServiceUrl: process.env.AGENT_SERVICE_URL ?? "http://localhost:8080/api/agent",
  corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000",
};
