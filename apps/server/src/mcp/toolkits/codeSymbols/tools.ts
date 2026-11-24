import { CodeSymbolKind, CodeSymbolSearchInput, OrchestratorMcpFailure } from "@dacre/contracts";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as CodeSymbols from "../../../codeSymbols/CodeSymbols.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const CodeSymbolsTool = Tool.make("code_symbols", {
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    CodeSymbols.CodeSymbols,
  ],
  description:
    "Find where functions, classes, methods, types and constants are defined in this thread's project, by part of the name.",
  parameters: Schema.Struct({
    query: CodeSymbolSearchInput.fields.query,
    kind: Schema.optionalKey(CodeSymbolKind),
    limit: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })).annotate({
        description: "Default 20.",
      }),
    ),
  }),
  success: Schema.Struct({
    symbols: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        kind: CodeSymbolKind,
        path: Schema.String,
        line: Schema.Int,
        container: Schema.NullOr(Schema.String),
      }),
    ),
    indexing: Schema.Boolean.annotate({
      description: "The project's first index is still building, so results may be missing.",
    }),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const CodeSymbolsToolkit = Toolkit.make(CodeSymbolsTool);
