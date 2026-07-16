import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. Reuse a single instance across the process to avoid
 * exhausting connections (important for the API and worker under load).
 */
export const prisma = new PrismaClient();

export * from "@prisma/client";
