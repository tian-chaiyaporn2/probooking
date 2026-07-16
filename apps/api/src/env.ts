import { config } from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Loads environment variables. Imported FIRST in main.ts so process.env is populated
 * before any other module evaluates — critical because @probook/db constructs its
 * PrismaClient (reading DATABASE_URL) at import time, and ESM hoists imports.
 *
 * Loads the repo-root .env (relative to this file's built location) and, as a
 * fallback, .env in the current working directory. Missing files are ignored.
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
config();
