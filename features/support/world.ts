import { setWorldConstructor, World } from "@cucumber/cucumber";

/**
 * Shared test world. Holds the scenario's working state (roles, money, offers,
 * booking context) so steps can build up and assert domain outcomes without I/O.
 * Integration scenarios can extend this to hold an API client / DB handle.
 */
export class ProBookingWorld extends World {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: Record<string, any> = {};
  lastError: unknown = null;
}

setWorldConstructor(ProBookingWorld);
