import "../src/config";
import { Database } from "../src/database";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function migrate(db: Database) {
  await db.transaction(null, async (sql) => {
    await sql.query("SELECT pg_advisory_xact_lock(2026090701)");
    await sql.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())",
    );
    const directory = resolve(__dirname, "../migrations");
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await sql.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            file,
          ])
        ).rowCount
      )
        continue;
      await sql.query(await readFile(resolve(directory, file), "utf8"));
      await sql.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      console.log(`Applied ${file}`);
    }
  });
}
if (require.main === module) {
  const db = new Database();
  migrate(db)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.onModuleDestroy());
}
