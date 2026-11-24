import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Definitions in each project's source files. A trigram index finds a name by any 3+ character
 * part in any case; without one, search scans names with LIKE.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE code_symbol_files (
    id INTEGER PRIMARY KEY, root TEXT NOT NULL, path TEXT NOT NULL,
    size INTEGER NOT NULL, mtime_ms INTEGER NOT NULL, UNIQUE (root, path)
  )`;
  yield* sql`CREATE TABLE code_symbols (
    id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
    line INTEGER NOT NULL, col INTEGER NOT NULL, container TEXT
  )`;
  yield* sql`CREATE INDEX code_symbols_file_idx ON code_symbols(file_id)`;

  // Only SQLITE_ERROR means this SQLite build lacks FTS5 trigrams; other failures fail the
  // migration so the next startup retries.
  const created = yield* sql`
    CREATE VIRTUAL TABLE code_symbols_fts USING fts5(
      name, content = 'code_symbols', content_rowid = 'id', tokenize = 'trigram'
    )
  `.pipe(
    Effect.as(true),
    Effect.catchIf(
      (cause) =>
        Predicate.hasProperty(cause.reason.cause, "errcode") && cause.reason.cause.errcode === 1,
      (cause) =>
        Effect.logWarning("Symbol search index unavailable; search will scan names.", cause).pipe(
          Effect.as(false),
        ),
    ),
  );
  if (!created) return;
  yield* sql`
    CREATE TRIGGER code_symbols_fts_insert AFTER INSERT ON code_symbols BEGIN
      INSERT INTO code_symbols_fts (rowid, name) VALUES (new.id, new.name);
    END
  `;
  yield* sql`
    CREATE TRIGGER code_symbols_fts_delete AFTER DELETE ON code_symbols BEGIN
      INSERT INTO code_symbols_fts (code_symbols_fts, rowid, name) VALUES ('delete', old.id, old.name);
    END
  `;
});
