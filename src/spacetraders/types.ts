// Minimal request/response shapes for the SpaceTraders endpoints this service proxies.
// Responses are passed through as-is (typed as unknown data payloads) — this service
// doesn't transform them, just forwards + wraps errors.

export interface SpaceTradersEnvelope<T> {
  data: T;
}

export interface NavigateRequestBody {
  waypointSymbol: string;
}

export interface SurveyDeposit {
  symbol: string;
}

export interface Survey {
  signature: string;
  symbol: string;
  deposits: SurveyDeposit[];
  expiration: string;
  size: "SMALL" | "MODERATE" | "LARGE";
}

export interface ExtractRequestBody {
  survey?: Survey;
}

export interface RefuelRequestBody {
  units?: number;
  fromCargo?: boolean;
}

export interface SellCargoRequestBody {
  symbol: string;
  units: number;
}

export interface DeliverContractRequestBody {
  shipSymbol: string;
  tradeSymbol: string;
  units: number;
}

export interface PatchNavRequestBody {
  flightMode: "DRIFT" | "STEALTH" | "CRUISE" | "BURN";
}

export interface PurchaseCargoRequestBody {
  symbol: string;
  units: number;
}

export interface TransferCargoRequestBody {
  tradeSymbol: string;
  units: number;
  shipSymbol: string;
}

export interface PurchaseShipRequestBody {
  shipType: string;
  waypointSymbol: string;
}
