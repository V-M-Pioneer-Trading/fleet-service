// Shapes for the SpaceTraders endpoints this service proxies.
// Request bodies are closed: tsoa answers 400 for a field not listed, which is intended.
// Response bodies are passed through as-is (this service forwards and wraps errors, never
// transforms), so the response shapes below only document them for the OpenAPI spec and are
// not validated at runtime. Each response model is open (`[key: string]: unknown`), so an
// upstream field not listed here still reaches the caller, and the spec says so.
// Field sets follow SpaceTraders API 2.3.0; a field is required only where upstream
// guarantees it and command-interface reads it as present.

// --- response models (open) ---

export interface RouteWaypoint {
  [key: string]: unknown;
  symbol?: string;
  type?: string;
  systemSymbol?: string;
  x?: number;
  y?: number;
}

export interface ShipRoute {
  [key: string]: unknown;
  destination?: RouteWaypoint;
  origin?: RouteWaypoint;
  departureTime?: string;
  arrival?: string;
}

export interface ShipNav {
  [key: string]: unknown;
  systemSymbol?: string;
  waypointSymbol?: string;
  route?: ShipRoute;
  status?: string;
  flightMode?: string;
}

export interface ShipFuelConsumed {
  [key: string]: unknown;
  amount?: number;
  timestamp?: string;
}

export interface ShipFuel {
  [key: string]: unknown;
  current?: number;
  capacity?: number;
  consumed?: ShipFuelConsumed;
}

export interface CargoItem {
  [key: string]: unknown;
  symbol: string;
  name: string;
  description: string;
  units: number;
}

export interface ShipCargo {
  [key: string]: unknown;
  capacity: number;
  units: number;
  inventory: CargoItem[];
}

export interface Cooldown {
  [key: string]: unknown;
  shipSymbol: string;
  totalSeconds: number;
  remainingSeconds: number;
  expiration?: string;
}

export interface ExtractionYield {
  [key: string]: unknown;
  symbol?: string;
  units?: number;
}

export interface Extraction {
  [key: string]: unknown;
  shipSymbol?: string;
  yield?: ExtractionYield;
}

export interface MarketTransaction {
  [key: string]: unknown;
  waypointSymbol?: string;
  shipSymbol?: string;
  tradeSymbol?: string;
  type?: string;
  units?: number;
  pricePerUnit?: number;
  totalPrice?: number;
  timestamp?: string;
}

export interface Agent {
  [key: string]: unknown;
  accountId?: string;
  symbol?: string;
  headquarters?: string;
  credits?: number;
  startingFaction?: string;
  shipCount?: number;
}

export interface ShipConditionEvent {
  [key: string]: unknown;
  symbol?: string;
  component?: string;
  name?: string;
  description?: string;
}

export interface WaypointModifier {
  [key: string]: unknown;
  symbol?: string;
  name?: string;
  description?: string;
}

export interface ContractTerms {
  [key: string]: unknown;
  deadline?: string;
}

export interface Contract {
  [key: string]: unknown;
  id?: string;
  factionSymbol?: string;
  type?: string;
  terms?: ContractTerms;
  accepted?: boolean;
  fulfilled?: boolean;
  expiration?: string;
  deadlineToAccept?: string;
}

// --- response bodies, one per route ---

export interface OrbitShipResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; nav?: ShipNav };
}

export interface DockShipResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; nav?: ShipNav };
}

export interface NavigateShipResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; nav?: ShipNav; fuel?: ShipFuel; events?: ShipConditionEvent[] };
}

export interface PatchNavResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; nav?: ShipNav; fuel?: ShipFuel; events?: ShipConditionEvent[] };
}

export interface ExtractResponse {
  [key: string]: unknown;
  data?: {
    [key: string]: unknown;
    extraction?: Extraction;
    cooldown?: Cooldown;
    cargo?: ShipCargo;
    modifiers?: WaypointModifier[];
    events?: ShipConditionEvent[];
  };
}

export interface ExtractWithSurveyResponse {
  [key: string]: unknown;
  data?: {
    [key: string]: unknown;
    extraction?: Extraction;
    cooldown?: Cooldown;
    cargo?: ShipCargo;
    events?: ShipConditionEvent[];
  };
}

export interface SurveyResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; cooldown?: Cooldown; surveys?: Survey[] };
}

export interface RefuelShipResponse {
  [key: string]: unknown;
  data?: {
    [key: string]: unknown;
    agent?: Agent;
    fuel?: ShipFuel;
    transaction?: MarketTransaction;
    cargo?: ShipCargo;
  };
}

export interface CooldownResponse {
  [key: string]: unknown;
  data: Cooldown;
}

export interface CargoResponse {
  [key: string]: unknown;
  data?: ShipCargo;
}

export interface TransferCargoResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; cargo?: ShipCargo };
}

export interface DeliverContractResponse {
  [key: string]: unknown;
  data?: { [key: string]: unknown; contract?: Contract; cargo?: ShipCargo };
}

// --- request bodies (closed) ---

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

export interface DeliverContractRequestBody {
  shipSymbol: string;
  tradeSymbol: string;
  units: number;
}

export interface PatchNavRequestBody {
  flightMode: "DRIFT" | "STEALTH" | "CRUISE" | "BURN";
}

export interface TransferCargoRequestBody {
  tradeSymbol: string;
  units: number;
  shipSymbol: string;
}
