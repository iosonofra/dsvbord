import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_SCHEMA_SQL } from "./schema";

const configuredDataDirectory = process.env.DSV_DATA_DIR;
const dataDirectory = configuredDataDirectory
  ? path.resolve(/* turbopackIgnore: true */ configuredDataDirectory)
  : path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "dsv-bordero.sqlite");
const pdfDirectory = path.join(dataDirectory, "pdfs");

let database: DatabaseSync | undefined;

export function getDataPaths() {
  return { dataDirectory, databasePath, pdfDirectory };
}

export function getDb() {
  if (database) return database;
  mkdirSync(pdfDirectory, { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  database.exec(LOCAL_SCHEMA_SQL);
  return database;
}
