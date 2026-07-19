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

describe("patient-data filter does not block legitimate clinical messages (§7.3)", () => {
  // A hit is a hard 400 at the API, so a false positive is not a warning — it stops a
  // clinic sending a real message. These all matched before: the ID pattern allowed each
  // digit its own space, so any run of 13 space-separated digits looked like a national ID.
  it.each([
    ["ward 3 beds 12 5 7 9 11 2 4 6 8 10", "a ward/bed list"],
    ["rates 800 900 1000 120", "a list of rates"],
    ["shift on 12 13 2026 at 9 30 am", "dates and times"],
    ["we need 2 nurses and 1 dental_assistant for 8 hours", "ordinary numbers"],
  ])("allows %j (%s)", (text) => {
    expect(containsProhibitedPatientData(text)).toBe(false);
  });

  // ...while still catching the identifiers it exists for.
  it.each([
    ["1234567890123", "an unbroken national ID"],
    ["1-2345-67890-12-3", "a hyphen-grouped national ID"],
    ["1 2345 67890 12 3", "a space-grouped national ID"],
    ["patient HN 445566", "a hospital number"],
    ["AN:100234 admitted", "an admission number with a separator"],
    ["admit AN 4821", "an admission number with a space"],
    ["ผู้ป่วย 123456", "a Thai patient keyword near a number"],
  ])("still blocks %j (%s)", (text) => {
    expect(containsProhibitedPatientData(text)).toBe(true);
  });
});

describe("known false positive, held deliberately (§7.3)", () => {
  it("still flags 'AN <digits>' in capitalised prose", () => {
    // "PLEASE SEND AN 2024 SUMMARY" is indistinguishable from "admit AN 4821" by shape.
    // Documented as a test so the trade-off is visible and someone re-tightening the
    // pattern has to decide consciously rather than discover it in production.
    expect(containsProhibitedPatientData("PLEASE SEND AN 2024 SUMMARY")).toBe(true);
  });
});
