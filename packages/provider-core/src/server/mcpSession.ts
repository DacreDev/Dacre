import type {
  EnvironmentId,
  McpServerConfigs,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  UserMcpServerSupport,
} from "@dacre/contracts";
import type * as Effect from "effect/Effect";

/** One of the user's MCP servers as a session starts it, its variable and header values read. */
export type UserMcpServer =
  | {
      readonly name: string;
      readonly type: "stdio";
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly cwd?: string;
      readonly env: Readonly<Record<string, string>>;
    }
  | {
      readonly name: string;
      readonly type: "http";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    };

/** The enabled servers that serve every project or this thread's project. */
export function userMcpServersFromSettings(
  servers: McpServerConfigs,
  projectId: ProjectId | null,
): ReadonlyArray<UserMcpServer> {
  return Object.values(servers).flatMap(({ name, enabled, transport, scope }): UserMcpServer[] => {
    if (!enabled || (scope.kind === "project" && scope.projectId !== projectId)) return [];
    const values = (entries: ReadonlyArray<{ readonly name: string; readonly value: string }>) =>
      Object.fromEntries(entries.map((entry) => [entry.name, entry.value]));
    return [
      transport.type === "stdio"
        ? {
            name,
            type: "stdio",
            command: transport.command,
            args: transport.args,
            ...(transport.cwd === undefined ? {} : { cwd: transport.cwd }),
            env: values(transport.env),
          }
        : { name, type: "http", url: transport.url, headers: values(transport.headers) },
    ];
  });
}

/** The servers a provider with `support` can start; it receives none of the others. */
export function supportedUserMcpServers(
  support: UserMcpServerSupport | undefined,
  servers: ReadonlyArray<UserMcpServer> | undefined,
): ReadonlyArray<UserMcpServer> {
  if (support === undefined) return [];
  return (servers ?? []).filter((server) =>
    server.type === "http"
      ? support.http
      : support.stdio && (support.workingDirectory || server.cwd === undefined),
  );
}

/**
 * Sent by MCP clients that cannot defer tools themselves. The Dacre MCP server then
 * lists only a core set plus `tool_search`, which lists the rest on demand.
 */
export const MCP_TOOL_EXPOSURE_HEADER = "dacre-tool-exposure";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /** Omit preview_* instructions when the user withholds agent browser access. */
  readonly browserToolsAvailable: boolean;
  readonly capabilities?: ReadonlySet<string>;
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
  /** True while a delegated task this thread started will wake it with its result. */
  readonly hasPendingWake?: Effect.Effect<boolean>;
  /** The user's servers for this thread. Never log them: they carry secret values. */
  readonly userMcpServers?: ReadonlyArray<UserMcpServer>;
}

export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}
