import { OrchestratorMcpFailure } from "@dacre/contracts";
import * as Effect from "effect/Effect";

import * as CodeSymbols from "../../../codeSymbols/CodeSymbols.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { loadCaller, unavailable } from "../../threadAccess.ts";
import { CodeSymbolsToolkit } from "./tools.ts";

export const layer = McpToolAccess.toLayer(CodeSymbolsToolkit, {
  code_symbols: McpToolAccess.readsAsCaller(({ query, kind, limit }) =>
    Effect.gen(function* () {
      const codeSymbols = yield* CodeSymbols.CodeSymbols;
      // `readsAsCaller` has already required that a thread is calling.
      const { caller } = yield* loadCaller();
      if (caller === undefined) return yield* unavailable();
      const { symbols, status } = yield* codeSymbols
        .search({ projectId: caller.projectId, query, kind, limit: limit ?? 20 })
        .pipe(
          Effect.catchTags({
            CodeSymbolProjectNotFoundError: (error) =>
              Effect.fail(
                new OrchestratorMcpFailure({ code: "invalid_request", message: error.message }),
              ),
            CodeSymbolStorageError: () => Effect.fail(unavailable()),
          }),
        );
      return {
        symbols: symbols.map(({ name, kind, path, line, container }) => ({
          name,
          kind,
          path,
          line,
          container,
        })),
        indexing: status.state === "indexing" && status.indexedFiles === 0,
      };
    }),
  ),
});
