import { Body, Controller, Get, Header, Patch, Path, Post, Route, Tags } from "@tsoa/runtime";
import { spaceTradersRequest } from "../spacetraders/client";
import {
  ExtractRequestBody,
  NavigateRequestBody,
  PatchNavRequestBody,
  PurchaseCargoRequestBody,
  PurchaseShipRequestBody,
  RefuelRequestBody,
  SellCargoRequestBody,
  Survey,
  TransferCargoRequestBody,
} from "../spacetraders/types";

@Route("ships")
@Tags("ships")
export class ShipsController extends Controller {
  /** Move a ship from docked to orbit at its current waypoint. */
  @Post("{shipSymbol}/orbit")
  public async orbit(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/orbit`, authorization);
  }

  /** Dock a ship at its current waypoint. */
  @Post("{shipSymbol}/dock")
  public async dock(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/dock`, authorization);
  }

  /** Navigate a ship (must be in orbit) to a waypoint in the same system. */
  @Post("{shipSymbol}/navigate")
  public async navigate(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: NavigateRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/navigate`, authorization, body);
  }

  /** Extract resources at the ship's current waypoint. Optionally targets a prior survey. */
  @Post("{shipSymbol}/extract")
  public async extract(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: ExtractRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/extract`, authorization, body);
  }

  /** Extract resources using a previously created survey. */
  @Post("{shipSymbol}/extract/survey")
  public async extractWithSurvey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: Survey
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/extract/survey`, authorization, body);
  }

  /** Create a resource survey at the ship's current waypoint. */
  @Post("{shipSymbol}/survey")
  public async survey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/survey`, authorization);
  }

  /** Refuel a docked ship at a waypoint with a market that sells fuel. */
  @Post("{shipSymbol}/refuel")
  public async refuel(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: RefuelRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/refuel`, authorization, body);
  }

  /** Sell cargo the ship is carrying at a docked marketplace. */
  @Post("{shipSymbol}/sell")
  public async sell(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: SellCargoRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/sell`, authorization, body);
  }

  /** Get the ship's current cooldown (e.g. after extract/survey). */
  @Get("{shipSymbol}/cooldown")
  public async cooldown(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("GET", `/my/ships/${shipSymbol}/cooldown`, authorization);
  }

  /** Get the ship's current cargo hold contents. */
  @Get("{shipSymbol}/cargo")
  public async cargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("GET", `/my/ships/${shipSymbol}/cargo`, authorization);
  }

  /** Set the ship's flight mode (CRUISE, BURN, DRIFT, STEALTH), used on subsequent navigation. */
  @Patch("{shipSymbol}/nav")
  public async patchNav(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: PatchNavRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("PATCH", `/my/ships/${shipSymbol}/nav`, authorization, body);
  }

  /** Purchase a trade good into the ship's cargo hold at a docked marketplace. */
  @Post("{shipSymbol}/purchase")
  public async purchaseCargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: PurchaseCargoRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/purchase`, authorization, body);
  }

  /** Purchase a new ship. Requires an existing ship of yours docked at a waypoint with a shipyard. */
  @Post("purchase")
  public async purchaseShip(
    @Header("Authorization") authorization: string,
    @Body() body: PurchaseShipRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", "/my/ships", authorization, body);
  }

  /** Transfer cargo from this ship to another ship at the same waypoint. */
  @Post("{shipSymbol}/transfer")
  public async transferCargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: TransferCargoRequestBody
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/transfer`, authorization, body);
  }
}
