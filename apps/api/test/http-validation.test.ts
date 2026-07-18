import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../src/modules/marketplace/http-validation.js";

const schema = z.object({
  name: z.string().min(1).max(10),
  count: z.number().int().positive().optional(),
});

describe("parseBody (zod request validation)", () => {
  it("returns the parsed DTO for a valid body", () => {
    expect(parseBody(schema, { name: "ok", count: 3 })).toEqual({ name: "ok", count: 3 });
  });

  it("strips unknown keys (mass-assignment defence)", () => {
    const out = parseBody(schema, { name: "ok", role: "administrator" }) as Record<string, unknown>;
    expect(out).toEqual({ name: "ok" });
    expect(out.role).toBeUndefined();
  });

  it("throws a 400 naming the offending field", () => {
    try {
      parseBody(schema, { name: "" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toMatch(/name/);
    }
  });

  it("rejects a wrong-typed field", () => {
    expect(() => parseBody(schema, { name: "ok", count: -1 })).toThrow(BadRequestException);
    expect(() => parseBody(schema, { name: "ok", count: 1.5 })).toThrow(BadRequestException);
  });

  it("rejects a non-object body", () => {
    expect(() => parseBody(schema, "not an object")).toThrow(BadRequestException);
    expect(() => parseBody(schema, null)).toThrow(BadRequestException);
  });
});
