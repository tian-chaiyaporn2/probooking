import { describe, it, expect } from "vitest";
import { containsProhibitedPatientData } from "../src/privacy.js";

describe("containsProhibitedPatientData (§7.3)", () => {
  it("flags Thai patient keyword near a number (ASCII \\b does not apply to Thai)", () => {
    expect(containsProhibitedPatientData("ผู้ป่วย เลข 12345")).toBe(true);
    expect(containsProhibitedPatientData("ผู้ป่วย12345")).toBe(true);
  });

  it("flags hospital/admission record numbers", () => {
    expect(containsProhibitedPatientData("refer HN 55231 to cardiology")).toBe(true);
    expect(containsProhibitedPatientData("hn55231")).toBe(true);
    expect(containsProhibitedPatientData("admit AN 4821")).toBe(true);
  });

  it("flags a 13-digit Thai national ID, plain or separated", () => {
    expect(containsProhibitedPatientData("id 1234567890123")).toBe(true);
    expect(containsProhibitedPatientData("1-2345-67890-12-3")).toBe(true);
  });

  it("does NOT false-positive on the English article 'an' before a year", () => {
    expect(containsProhibitedPatientData("an 2024 annual report")).toBe(false);
    expect(containsProhibitedPatientData("the plan for 2024")).toBe(false);
  });

  it("does NOT flag ordinary text or a 10-digit phone number", () => {
    expect(containsProhibitedPatientData("see you on tuesday, thanks")).toBe(false);
    expect(containsProhibitedPatientData("call me 0812345678")).toBe(false);
  });
});
