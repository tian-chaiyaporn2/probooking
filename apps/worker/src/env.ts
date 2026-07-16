import { config } from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Loads env vars before anything else. Imported FIRST in index.ts because
 * @probook/db constructs its PrismaClient (reading DATABASE_URL) at import time and
 * ESM hoists imports. Loads the repo-root .env (relative to this source file — the
 * worker runs via tsx, so import.meta.url points at src/) then cwd .env as fallback.
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
config();
