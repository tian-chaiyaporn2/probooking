import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/**
 * Parse an untrusted request body against a zod schema, turning a validation failure into a
 * 400 that names the offending fields (rather than a downstream 500 or a silently-wrong
 * domain call). Replaces the hand-rolled `validateBody` field-spec checker: zod gives us the
 * inferred DTO type, composable schemas, and unknown-key stripping (mass-assignment defence)
 * for free — `z.object` drops keys the schema does not declare.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    throw new BadRequestException(message || "invalid request body");
  }
  return result.data;
}
