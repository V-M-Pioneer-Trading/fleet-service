import { Body, Controller, Get, Header, Patch, Path, Post, Route, Tags } from "@tsoa/runtime";
import { shipPath, spaceTradersRequest } from "../spacetraders/client";
import {
  ExtractRequestBody,
  NavigateRequestBody,
  PatchNavRequestBody,
  RefuelRequestBody,
  Survey,
  TransferCargoRequestBody,
} from "../spacetraders/types";

/** Every route here answers with SpaceTraders' response body, unmodified. */
type ShipActionResponse = Record<string, unknown>;

// `Authorization` on every route here is the Clerk session server.ts's auth
// middleware already verified before a request reaches a controller method.
// It is declared again as a parameter only so it can be forwarded verbatim to
// st-gateway, which derives queue priority from it (auth-design.md decision
// 2). No SpaceTraders credential passes through here: st-gateway injects the
// agent token itself (decision 5).
@Route("ships")
@Tags("ships")
export class ShipsController extends Controller {
  /** Move a ship from docked to orbit at its current waypoint. */
  @Post("{shipSymbol}/orbit")
  public async orbit(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "orbit"), authorization);
  }

  /** Dock a ship at its current waypoint. */
  @Post("{shipSymbol}/dock")
  public async dock(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "dock"), authorization);
  }

  /** Navigate a ship (must be in orbit) to a waypoint in the same system. */
  @Post("{shipSymbol}/navigate")
  public async navigate(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: NavigateRequestBody,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "navigate"), authorization, body);
  }

  /** Extract resources at the ship's current waypoint. Optionally targets a prior survey. */
  @Post("{shipSymbol}/extract")
  public async extract(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: ExtractRequestBody,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "extract"), authorization, body);
  }

  /** Extract resources using a previously created survey. */
  @Post("{shipSymbol}/extract/survey")
  public async extractWithSurvey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: Survey,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "extract/survey"), authorization, body);
  }

  /** Create a resource survey at the ship's current waypoint. */
  @Post("{shipSymbol}/survey")
  public async survey(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "survey"), authorization);
  }

  /** Refuel a docked ship at a waypoint with a market that sells fuel. */
  @Post("{shipSymbol}/refuel")
  public async refuel(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body?: RefuelRequestBody,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "refuel"), authorization, body);
  }

  /** Get the ship's current cooldown (e.g. after extract/survey). */
  @Get("{shipSymbol}/cooldown")
  public async cooldown(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("GET", shipPath(shipSymbol, "cooldown"), authorization);
  }

  /** Get the ship's current cargo hold contents. */
  @Get("{shipSymbol}/cargo")
  public async cargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("GET", shipPath(shipSymbol, "cargo"), authorization);
  }

  /** Set the ship's flight mode (CRUISE, BURN, DRIFT, STEALTH), used on subsequent navigation. */
  @Patch("{shipSymbol}/nav")
  public async patchNav(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: PatchNavRequestBody,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("PATCH", shipPath(shipSymbol, "nav"), authorization, body);
  }

  /** Transfer cargo from this ship to another ship at the same waypoint. */
  @Post("{shipSymbol}/transfer")
  public async transferCargo(
    @Path() shipSymbol: string,
    @Header("Authorization") authorization: string,
    @Body() body: TransferCargoRequestBody,
  ): Promise<ShipActionResponse> {
    return spaceTradersRequest("POST", shipPath(shipSymbol, "transfer"), authorization, body);
  }
}
