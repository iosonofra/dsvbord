export const LOCAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    references_text TEXT NOT NULL DEFAULT '',
    shipments INTEGER NOT NULL,
    packages INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    rows_json TEXT NOT NULL DEFAULT '[]',
    pdf_file TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'Postazione sconosciuta',
    archived_at TEXT,
    archived_by TEXT
  );
  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS orders_archived_at_idx ON orders(archived_at);
  CREATE TABLE IF NOT EXISTS bordero_counters (
    day TEXT PRIMARY KEY NOT NULL,
    last_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL,
    workstation TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS order_activity_order_idx ON order_activity(order_id, created_at DESC);
`;
