import { SCOPE_FLEET_CONTROL } from "../auth";

describe("scope contract", () => {
  // This string is a contract, not an implementation detail: Clerk issues it
  // and auth-service, agent-service and the operator UI all spell it the same
  // way. Changing it here alone silently locks every operator out of mutations.
  it("is exactly fleet:control", () => {
    expect(SCOPE_FLEET_CONTROL).toBe("fleet:control");
  });
});
