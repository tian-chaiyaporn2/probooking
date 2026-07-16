import { BadRequestException } from "@nestjs/common";

/**
 * Dependency-free request-body validation. NestJS's ValidationPipe needs class-validator
 * (not available here), so this validates plain DTOs against a small field spec and throws
 * a 400 with the offending fields — turning untrusted bodies into predictable errors
 * rather than downstream 500s or silently-wrong domain calls.
 */
export interface FieldSpec {
  type: "string" | "number" | "boolean";
  optional?: boolean;
  int?: boolean; // number must be an integer
  positive?: boolean; // number must be > 0
  min?: number; // number lower bound (inclusive)
  max?: number; // number upper bound (inclusive)
  maxLen?: number; // string max length
  enum?: readonly string[]; // string must be one of these
}

export function validateBody<T>(body: unknown, spec: Record<string, FieldSpec>): T {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestException("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  for (const [key, s] of Object.entries(spec)) {
    const v = b[key];
    if (v === undefined || v === null) {
      if (!s.optional) errors.push(`${key} is required`);
      continue;
    }
    if (typeof v !== s.type) {
      errors.push(`${key} must be a ${s.type}`);
      continue;
    }
    if (s.type === "number") {
      const n = v as number;
      if (!Number.isFinite(n)) errors.push(`${key} must be a finite number`);
      else {
        if (s.int && !Number.isInteger(n)) errors.push(`${key} must be an integer`);
        if (s.positive && n <= 0) errors.push(`${key} must be positive`);
        if (s.min !== undefined && n < s.min) errors.push(`${key} must be >= ${s.min}`);
        if (s.max !== undefined && n > s.max) errors.push(`${key} must be <= ${s.max}`);
      }
    }
    if (s.type === "string") {
      const str = v as string;
      if (s.maxLen !== undefined && str.length > s.maxLen) errors.push(`${key} exceeds ${s.maxLen} chars`);
      if (s.enum && !s.enum.includes(str)) errors.push(`${key} must be one of: ${s.enum.join(", ")}`);
    }
  }

  if (errors.length) throw new BadRequestException(errors.join("; "));
  return b as T;
}
