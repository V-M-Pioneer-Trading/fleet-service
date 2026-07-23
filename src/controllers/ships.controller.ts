import { Body, Controller, Get, Header, Patch, Path, Post, Route, Tags } from "@tsoa/runtime";
import { spaceTradersRequest } from "../spacetraders/client";
import {
  ExtractRequestBody,
  NavigateRequestBody,
  PatchNavRequestBody,
  RefuelRequestBody,
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
    @Header("Authorization") authorization: string,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/orbit`, authorization, undefined, priority);
  }

  /** Dock a ship at its current waypoint. */
  @Post("{shipSymbol}/dock")
  public async dock(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/dock`, authorization, undefined, priority);
  }

  /** Navigate a ship (must be in orbit) to a waypoint in the same system. */
  @Post("{shipSymbol}/navigate")
  public async navigate(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: NavigateRequestBody,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/navigate`, authorization, body, priority);
  }

  /** Extract resources at the ship's current waypoint. Optionally targets a prior survey. */
  @Post("{shipSymbol}/extract")
  public async extract(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: ExtractRequestBody,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/extract`, authorization, body, priority);
  }

  /** Extract resources using a previously created survey. */
  @Post("{shipSymbol}/extract/survey")
  public async extractWithSurvey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: Survey,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/extract/survey`, authorization, body, priority);
  }

  /** Create a resource survey at the ship's current waypoint. */
  @Post("{shipSymbol}/survey")
  public async survey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/survey`, authorization, undefined, priority);
  }

  /** Refuel a docked ship at a waypoint with a market that sells fuel. */
  @Post("{shipSymbol}/refuel")
  public async refuel(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: RefuelRequestBody,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/refuel`, authorization, body, priority);
  }

  /** Get the ship's current cooldown (e.g. after extract/survey). */
  @Get("{shipSymbol}/cooldown")
  public async cooldown(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("GET", `/my/ships/${shipSymbol}/cooldown`, authorization, undefined, priority);
  }

  /** Get the ship's current cargo hold contents. */
  @Get("{shipSymbol}/cargo")
  public async cargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("GET", `/my/ships/${shipSymbol}/cargo`, authorization, undefined, priority);
  }

  /** Set the ship's flight mode (CRUISE, BURN, DRIFT, STEALTH), used on subsequent navigation. */
  @Patch("{shipSymbol}/nav")
  public async patchNav(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: PatchNavRequestBody,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("PATCH", `/my/ships/${shipSymbol}/nav`, authorization, body, priority);
  }

  /** Transfer cargo from this ship to another ship at the same waypoint. */
  @Post("{shipSymbol}/transfer")
  public async transferCargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: TransferCargoRequestBody,
    @Header("X-Priority") priority?: string
  ): Promise<Record<string, unknown>> {
    return spaceTradersRequest("POST", `/my/ships/${shipSymbol}/transfer`, authorization, body, priority);
  }
}
