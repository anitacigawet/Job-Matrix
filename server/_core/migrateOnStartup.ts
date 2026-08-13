/**
 * Migrations are now applied inline by initDb() in server/db.ts when the
 * SQLite database is opened. These functions are kept as no-ops so existing
 * imports continue to compile.
 */
export async function runMigrationsOnStartup(): Promise<void> {
  /* handled by initDb() */
}

export async function verifySchemaReadiness(): Promise<void> {
  /* handled by initDb() */
}
