import { defineConfig } from "drizzle-kit";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "app.db");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  casing: "snake_case",
  dbCredentials: {
    url: dbPath,
  },
});
