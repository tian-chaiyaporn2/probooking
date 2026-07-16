import { Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { can, requiresDualControl, type Role, type Capability } from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Area 19: authorization capability matrix + dual control (§3, §6.4). */

Then(
  "role {string} {word} capability {string}",
  function (this: ProBookingWorld, role: string, allowed: string, capability: string) {
    const expected = allowed === "can";
    assert.equal(can(role as Role, capability as Capability), expected);
  },
);

Then(
  "capability {string} {word} dual control",
  function (this: ProBookingWorld, capability: string, requirement: string) {
    // "requires" -> true; "does" (from "does not need") -> false.
    const expected = requirement === "requires";
    assert.equal(requiresDualControl(capability as Capability), expected);
  },
);
