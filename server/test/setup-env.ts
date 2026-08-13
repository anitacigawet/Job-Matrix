import os from "node:os";
import path from "node:path";

// Every test process gets its own disposable local files. Setting these before
// application modules load prevents integration tests from touching data/app.db
// or the operator's saved API keys.
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(os.tmpdir(), `job-matrix-vitest-${process.pid}.db`);
process.env.SETTINGS_PATH = path.join(os.tmpdir(), `job-matrix-vitest-settings-${process.pid}.json`);
