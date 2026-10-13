import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { count } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "@fixit/shared";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function migrationsFolder(): string {
  // In the built image migrations sit next to dist/; in dev and tests, next to src/.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../drizzle"), path.resolve(here, "../../drizzle")];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "meta", "_journal.json")));
  if (!found) throw new Error(`Could not find database migrations (looked in ${candidates.join(", ")})`);
  return found;
}

/** Opens (or creates) the database, applies migrations and seeds default categories. */
export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: migrationsFolder() });
  seed(db);
  return db;
}

function seed(db: DB) {
  const [row] = db.select({ n: count() }).from(schema.categories).all();
  if ((row?.n ?? 0) > 0) return;
  db.insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name, icon: c.icon, sortOrder: i })))
    .run();
}

export { schema };
