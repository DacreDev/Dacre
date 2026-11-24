import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE brain_entries (
    id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX brain_entries_project_updated_idx ON brain_entries(project_id, updated_at)`;
});
