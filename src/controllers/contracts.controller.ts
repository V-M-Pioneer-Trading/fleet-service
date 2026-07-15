import { Body, Controller, Header, Path, Post, Route, Tags } from "tsoa";
import { config } from "../config";
import { spaceTradersRequest } from "../spacetraders/client";
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
    @Body() body: DeliverContractRequestBody
  ): Promise<Record<string, unknown>> {
    const result = await spaceTradersRequest<Record<string, unknown>>(
      "POST",
      `/my/contracts/${contractId}/deliver`,
      authorization,
      body
    );

    await recordDelivery(contractId, authorization, body);

    return result;
  }
}

async function recordDelivery(
  contractId: string,
  authorization: string,
  body: DeliverContractRequestBody
): Promise<void> {
  try {
    const res = await fetch(`${config.agentServiceUrl}/contracts/${contractId}/deliveries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        shipSymbol: body.shipSymbol,
        tradeSymbol: body.tradeSymbol,
        units: body.units,
      }),
    });
    if (!res.ok) {
      console.error(
        `agent-service rejected delivery record for contract ${contractId}: ${res.status} ${await res.text()}`
      );
    }
  } catch (err) {
    console.error(`failed to reach agent-service to record delivery for contract ${contractId}:`, err);
  }
}
