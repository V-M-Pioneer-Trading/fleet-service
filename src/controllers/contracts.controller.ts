import { Body, Controller, Header, Path, Post, Route, Tags } from "@tsoa/runtime";
import { config } from "../config";
import { contractPath, spaceTradersRequest } from "../spacetraders/client";
import { DeliverContractRequestBody } from "../spacetraders/types";

@Route("contracts")
@Tags("contracts")
export class ContractsController extends Controller {
  /**
   * Deliver cargo against a contract. Calls SpaceTraders' deliver-contract, then records the
   * delivery in agent-service's contract history. If that recording call fails, the
   * SpaceTraders delivery (already completed) is still returned to the caller — there's
   * nothing to roll back, and losing delivery history shouldn't hide a successful gameplay
   * action.
   */
  @Post("{contractId}/deliver")
  public async deliver(
    @Path() contractId: string,
    @Header("Authorization") authorization: string,
    @Body() body: DeliverContractRequestBody,
  ): Promise<Record<string, unknown>> {
    const result = await spaceTradersRequest<Record<string, unknown>>(
      "POST",
      contractPath(contractId, "deliver"),
      authorization,
      body
    );

    await recordDelivery(contractId, body);

    return result;
  }
}

async function recordDelivery(contractId: string, body: DeliverContractRequestBody): Promise<void> {
  // Encoded for the same reason as the SpaceTraders paths: contractId is
  // caller-supplied and would otherwise be able to steer this at another
  // agent-service route.
  const url = `${config.agentServiceUrl}/contracts/${encodeURIComponent(contractId)}/deliveries`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipSymbol: body.shipSymbol,
        tradeSymbol: body.tradeSymbol,
        units: body.units,
      }),
      // Without a deadline a hung agent-service holds the caller's delivery
      // response open, even though this call is best-effort bookkeeping.
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (!res.ok) {
      // contractId is caller-supplied and reaches the log verbatim: a raw
      // newline in it forges a second log line. JSON.stringify escapes it (and
      // quotes it, so the boundary is visible). The body is capped for the
      // same reason the client caps an upstream message — an agent-service
      // HTML error page shouldn't become kilobytes of log per request.
      console.error(
        `agent-service rejected delivery record for contract ${JSON.stringify(contractId)}: ` +
          `${res.status} ${(await res.text()).slice(0, 500)}`
      );
    }
  } catch (err) {
    console.error(
      `failed to reach agent-service to record delivery for contract ${JSON.stringify(contractId)}:`,
      err
    );
  }
}
