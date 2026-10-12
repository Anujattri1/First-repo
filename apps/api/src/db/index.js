// ---------------------------------------------------------------------------
// Database bootstrap — opens SQLite (WAL mode for heavy concurrent reads)
// and applies schema.sql idempotently.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import config from "../config.js";

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new Database(config.dbFile);
  db.pragma("journal_mode = WAL");   // concurrent readers + fast writes
  db.pragma("synchronous = NORMAL"); // safe with WAL, much faster than FULL
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  return db;
}

export default getDb;
