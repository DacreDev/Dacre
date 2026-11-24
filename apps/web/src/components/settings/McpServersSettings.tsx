import { useAtomValue } from "@effect/atom-react";
import {
  conflictingMcpServerId,
  McpServerId,
  type McpServerConfig,
  type McpServerTestResult,
  type ProjectId,
  type ServerProvider,
} from "@dacre/contracts";
import { squashAtomCommandFailure } from "@dacre/client-runtime/state/runtime";
import { T, useGT, Var } from "gt-react";
import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { randomUUID } from "../../lib/utils";
import { useProjects } from "../../state/entities";
import { useEnvironmentProviders, type EnvironmentPresentation } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button, InlineButton } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Text } from "../ui/text";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  configFromDraft,
  draftFromConfig,
  emptyMcpServerDraft,
  newEntryKey,
  parseMcpServersImport,
  type McpServerDraft,
  type McpServerEntryDraft,
} from "./McpServersSettings.logic";
import { SecretInput } from "./SecretInput";
import { useSettingsScope } from "./SettingsScopeContext";
import { useSearchableSetting } from "./settingsSearch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

type TestState = { readonly _tag: "Running" } | McpServerTestResult;

export function McpServersSettingsPanel() {
  const setting = useSearchableSetting();
  const { scope, environment } = useSettingsScope();
  const connected = environment?.connection.phase === "connected";
  return (
    <SettingsPageContainer>
      {connected &&
      environment.serverConfig !== null &&
      environment.serverConfig.mcpServerSettings !== true ? (
        <SettingsSection {...setting("mcp-servers")}>
          <p className="px-4 py-3 text-body text-muted-foreground">
            <T>
              Update Dacre on <Var>{environment.label}</Var> to manage its MCP servers.
            </T>
          </p>
        </SettingsSection>
      ) : connected ? (
        <EnvironmentMcpServers
          key={environment.environmentId}
          environment={environment}
          projectScoped={scope.kind === "project" || scope.kind === "checkout"}
        />
      ) : (
        <SettingsSection {...setting("mcp-servers")}>
          <p className="px-4 py-3 text-body text-muted-foreground">
            <T>Connect an environment to manage the MCP servers its agents receive.</T>
          </p>
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}

function EnvironmentMcpServers({
  environment,
  projectScoped,
}: {
  readonly environment: EnvironmentPresentation;
  readonly projectScoped: boolean;
}) {
  const gt = useGT();
  const setting = useSearchableSetting();
  const environmentId = environment.environmentId;
  const servers = useEnvironmentSettings(environmentId, (settings) => settings.mcpServers);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  // Adding or changing a server needs the same grant as testing one: providers:manage.
  const canManage = useAtomValue(serverEnvironment.testMcpServer.permissionAtom(environmentId));
  const editable = canManage && !projectScoped;
  const testServer = useAtomCommand(serverEnvironment.testMcpServer, { reportFailure: false });
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const providers = useEnvironmentProviders().get(environmentId) ?? [];
  const [dialog, setDialog] = useState<
    | null
    | { readonly mode: "add" }
    | { readonly mode: "edit"; readonly id: McpServerId }
    | { readonly mode: "import" }
  >(null);
  const [tests, setTests] = useState<Readonly<Record<string, TestState>>>({});
  const entries = (Object.entries(servers) as Array<[McpServerId, McpServerConfig]>).toSorted(
    ([, left], [, right]) => left.name.localeCompare(right.name),
  );
  const editing = dialog?.mode === "edit" ? servers[dialog.id] : undefined;

  const test = async (id: McpServerId) => {
    setTests((current) => ({ ...current, [id]: { _tag: "Running" } }));
    const result = await testServer({ environmentId, input: { id } });
    const error = result._tag === "Success" ? null : squashAtomCommandFailure(result);
    setTests((current) => ({
      ...current,
      [id]:
        result._tag === "Success"
          ? result.value
          : {
              _tag: "Failed",
              detail: error instanceof Error ? error.message : gt("The test could not run."),
            },
    }));
  };
  const save = (id: McpServerId, config: McpServerConfig | null) => {
    updateSettings({ mcpServers: { [id]: config } });
    // A saved change makes the last result stale. Not a computed-key destructure: the
    // React Compiler cannot lower one yet.
    setTests((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
    );
  };
  const projectTitle = ({ scope }: McpServerConfig) =>
    scope.kind === "all"
      ? gt("All projects")
      : (projects.find((project) => project.id === scope.projectId)?.title ??
        gt("A removed project"));

  return (
    <>
      <SettingsSection
        {...setting("mcp-servers")}
        headerAction={
          editable ? (
            <div className="flex items-center gap-2">
              <Button size="xs" variant="ghost" onClick={() => setDialog({ mode: "import" })}>
                <T>Import</T>
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setDialog({ mode: "add" })}>
                <PlusIcon aria-hidden />
                <T>Add server</T>
              </Button>
            </div>
          ) : null
        }
      >
        {projectScoped ? (
          <p className="px-4 pt-3 text-meta text-muted-foreground">
            <T>Environment-wide setting. Select an environment to change it.</T>
          </p>
        ) : null}
        {entries.length === 0 ? (
          <SettingsRow
            title={gt("No MCP servers yet")}
            description={gt(
              "Add a server, or import the mcpServers object from Claude Desktop, Claude Code or Cursor. Every provider that can take them gets them in new sessions.",
            )}
          />
        ) : (
          entries.map(([id, server]) => (
            <McpServerRow
              key={id}
              server={server}
              scopeLabel={projectTitle(server)}
              testState={tests[id]}
              editable={editable}
              onTest={() => void test(id)}
              onEdit={() => setDialog({ mode: "edit", id })}
              onRemove={() => save(id, null)}
              onEnabledChange={(enabled) => save(id, { ...server, enabled })}
            />
          ))
        )}
      </SettingsSection>
      <ProviderSupportSection providers={providers} />
      {editable && (dialog?.mode === "add" || editing !== undefined) ? (
        <McpServerDialog
          projects={projects}
          initial={editing === undefined ? emptyMcpServerDraft() : draftFromConfig(editing)}
          isNew={editing === undefined}
          nameTaken={(config) =>
            conflictingMcpServerId(servers, dialog?.mode === "edit" ? dialog.id : "", config) !==
            undefined
          }
          onClose={() => setDialog(null)}
          onSave={(config) => {
            save(dialog?.mode === "edit" ? dialog.id : McpServerId.make(randomUUID()), config);
            setDialog(null);
          }}
        />
      ) : null}
      {editable && dialog?.mode === "import" ? (
        <McpServerImportDialog
          existing={Object.values(servers)}
          onClose={() => setDialog(null)}
          onImport={(configs) => {
            updateSettings({
              mcpServers: Object.fromEntries(
                configs.map((config) => [McpServerId.make(randomUUID()), config]),
              ),
            });
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

function McpServerRow({
  server,
  scopeLabel,
  testState,
  editable,
  onTest,
  onEdit,
  onRemove,
  onEnabledChange,
}: {
  readonly server: McpServerConfig;
  readonly scopeLabel: string;
  readonly testState: TestState | undefined;
  readonly editable: boolean;
  readonly onTest: () => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  readonly onEnabledChange: (enabled: boolean) => void;
}) {
  const gt = useGT();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const { transport } = server;
  return (
    <SettingsRow
      title={server.name}
      description={
        <span className="grid min-w-0 gap-0.5">
          <Text variant="meta" tone="muted" mono truncate>
            {transport.type === "stdio"
              ? [transport.command, ...transport.args].join(" ")
              : transport.url}
          </Text>
          <span className="flex min-w-0 flex-wrap gap-x-3">
            <Text variant="meta" tone="muted">
              {transport.type === "stdio" ? gt("stdio") : gt("HTTP")}
            </Text>
            <Text variant="meta" tone="muted">
              {scopeLabel}
            </Text>
            <McpServerTestStatus state={testState} />
          </span>
        </span>
      }
      control={
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={!editable || testState?._tag === "Running"}
            onClick={onTest}
          >
            <T>Test</T>
          </Button>
          {editable ? (
            <>
              <Button size="xs" variant="ghost" onClick={onEdit}>
                <T>Edit</T>
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmingRemove(true)}>
                <T>Remove</T>
              </Button>
            </>
          ) : null}
          <Switch
            checked={server.enabled}
            disabled={!editable}
            onCheckedChange={(checked) => onEnabledChange(Boolean(checked))}
            aria-label={gt("Give {name} to agents", { name: server.name })}
          />
          <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <T>
                    Remove <Var>{server.name}</Var>?
                  </T>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <T>
                    New sessions stop receiving it, and its stored variable and header values are
                    deleted.
                  </T>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="secondary" />}>
                  <T>Cancel</T>
                </AlertDialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                >
                  <T>Remove server</T>
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        </div>
      }
    />
  );
}

function McpServerTestStatus({ state }: { readonly state: TestState | undefined }) {
  const gt = useGT();
  if (state === undefined) return null;
  if (state._tag === "Running") {
    return (
      <Text variant="meta" tone="muted">
        <T>Testing…</T>
      </Text>
    );
  }
  if (state._tag === "Connected") {
    const preview = state.tools.slice(0, 20).join(", ");
    return (
      <Tooltip>
        <TooltipTrigger render={<Text variant="meta" tone="muted" tabIndex={0} />}>
          {gt("{count, plural, one {Connected, # tool} other {Connected, # tools}}", {
            count: state.tools.length,
          })}
        </TooltipTrigger>
        <TooltipPopup side="top">{preview === "" ? gt("No tools") : preview}</TooltipPopup>
      </Tooltip>
    );
  }
  return (
    <span className="min-w-0 text-meta text-destructive-foreground wrap-anywhere">
      {state.detail}
    </span>
  );
}

function describeSupport(
  support: ServerProvider["userMcpServers"],
  gt: ReturnType<typeof useGT>,
): string {
  if (support === undefined || (!support.stdio && !support.http)) {
    return gt("Cannot receive MCP servers from Dacre.");
  }
  if (!support.stdio) return gt("Receives HTTP servers only.");
  if (support.http) {
    return support.workingDirectory
      ? gt("Receives stdio and HTTP servers.")
      : gt("Receives stdio and HTTP servers, except stdio servers that set a working folder.");
  }
  return support.workingDirectory
    ? gt("Receives stdio servers only.")
    : gt("Receives stdio servers only, except those that set a working folder.");
}

function ProviderSupportSection({
  providers,
}: {
  readonly providers: ReadonlyArray<ServerProvider>;
}) {
  const gt = useGT();
  const enabled = providers.filter((provider) => provider.enabled);
  if (enabled.length === 0) return null;
  return (
    <SettingsSection title={gt("Providers")}>
      {enabled.map((provider) => (
        <SettingsRow
          key={provider.instanceId}
          title={provider.displayName ?? provider.instanceId}
          description={describeSupport(provider.userMcpServers, gt)}
        />
      ))}
    </SettingsSection>
  );
}

function EntryRows({
  label,
  addLabel,
  entries,
  onChange,
}: {
  readonly label: string;
  readonly addLabel: string;
  readonly entries: ReadonlyArray<McpServerEntryDraft>;
  readonly onChange: (entries: ReadonlyArray<McpServerEntryDraft>) => void;
}) {
  const gt = useGT();
  const update = (key: string, patch: Partial<McpServerEntryDraft>) =>
    onChange(entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  return (
    <div className="grid gap-1.5">
      <Label render={<span />}>{label}</Label>
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-center gap-2">
          <Input
            size="sm"
            className="w-2/5 min-w-0"
            aria-label={gt("{label} name", { label })}
            value={entry.name}
            onChange={(event) => update(entry.key, { name: event.target.value })}
          />
          <SecretInput
            size="sm"
            className="min-w-0 flex-1"
            aria-label={gt("{label} value", { label })}
            // A renamed row's stored value belongs to the old name, so it needs a new one.
            configured={entry.saved !== "" && entry.name.trim() === entry.savedName}
            value={entry.value}
            onChange={(event) => update(entry.key, { value: event.target.value })}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={gt("Remove {name}", { name: entry.name || label })}
                  onClick={() => onChange(entries.filter((other) => other.key !== entry.key))}
                >
                  <XIcon className="size-3.5" />
                </Button>
              }
            />
            <TooltipPopup side="top">
              <T>Remove</T>
            </TooltipPopup>
          </Tooltip>
        </div>
      ))}
      <InlineButton
        type="button"
        className="justify-self-start"
        onClick={() =>
          onChange([...entries, { key: newEntryKey(), name: "", saved: "", value: "" }])
        }
      >
        <PlusIcon aria-hidden className="size-3" />
        {addLabel}
      </InlineButton>
    </div>
  );
}

function McpServerDialog(props: {
  readonly projects: ReadonlyArray<{ readonly id: ProjectId; readonly title: string }>;
  readonly initial: McpServerDraft;
  readonly isNew: boolean;
  readonly nameTaken: (config: McpServerConfig) => boolean;
  readonly onClose: () => void;
  readonly onSave: (config: McpServerConfig) => void;
}) {
  const gt = useGT();
  const fieldId = useId();
  const [draft, setDraft] = useState(props.initial);
  const [attempted, setAttempted] = useState(false);
  const result = configFromDraft(draft);
  const error =
    "error" in result
      ? result.error
      : props.nameTaken(result.config)
        ? gt("Another server is named {name} for the same projects.", { name: result.config.name })
        : null;
  const set = (patch: Partial<McpServerDraft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (error === null && "config" in result) props.onSave(result.config);
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.isNew ? gt("Add MCP server") : gt("Edit MCP server")}</DialogTitle>
            <DialogDescription>
              <T>
                Variable and header values are stored as secrets on this environment. New sessions
                get the change.
              </T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>
                <T>Name</T>
              </Label>
              <Input
                id={`${fieldId}-name`}
                autoFocus
                placeholder="github"
                value={draft.name}
                onChange={(event) => set({ name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-transport`}>
                <T>Connection</T>
              </Label>
              <Select
                value={draft.transport}
                onValueChange={(value) => set({ transport: value === "http" ? "http" : "stdio" })}
              >
                <SelectTrigger id={`${fieldId}-transport`}>
                  <SelectValue>
                    {draft.transport === "stdio"
                      ? gt("Run a command (stdio)")
                      : gt("Connect to a URL (HTTP)")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="stdio">{gt("Run a command (stdio)")}</SelectItem>
                  <SelectItem value="http">{gt("Connect to a URL (HTTP)")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
            {draft.transport === "stdio" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-command`}>
                    <T>Command</T>
                  </Label>
                  <Input
                    id={`${fieldId}-command`}
                    placeholder="npx"
                    value={draft.command}
                    onChange={(event) => set({ command: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-args`}>
                    <T>Arguments, one per line</T>
                  </Label>
                  <Textarea
                    id={`${fieldId}-args`}
                    rows={3}
                    value={draft.args}
                    onChange={(event) => set({ args: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-cwd`}>
                    <T>Working folder (optional)</T>
                  </Label>
                  <Input
                    id={`${fieldId}-cwd`}
                    value={draft.cwd}
                    onChange={(event) => set({ cwd: event.target.value })}
                  />
                </div>
                <EntryRows
                  label={gt("Environment variable")}
                  addLabel={gt("Add variable")}
                  entries={draft.env}
                  onChange={(env) => set({ env })}
                />
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-url`}>
                    <T>URL</T>
                  </Label>
                  <Input
                    id={`${fieldId}-url`}
                    placeholder="https://example.com/mcp"
                    value={draft.url}
                    onChange={(event) => set({ url: event.target.value })}
                  />
                </div>
                <EntryRows
                  label={gt("Header")}
                  addLabel={gt("Add header")}
                  entries={draft.headers}
                  onChange={(headers) => set({ headers })}
                />
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-scope`}>
                <T>Projects</T>
              </Label>
              <Select
                value={draft.projectId ?? ""}
                onValueChange={(value) =>
                  set({
                    projectId: props.projects.find((project) => project.id === value)?.id ?? null,
                  })
                }
              >
                <SelectTrigger id={`${fieldId}-scope`}>
                  <SelectValue>
                    {draft.projectId === null
                      ? gt("All projects")
                      : (props.projects.find((project) => project.id === draft.projectId)?.title ??
                        gt("A removed project"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="">{gt("All projects")}</SelectItem>
                  {props.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            {attempted && error !== null ? (
              <Text render={<p role="alert" />} variant="meta" tone="destructive">
                {error}
              </Text>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit">
              <T>Save server</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function McpServerImportDialog(props: {
  readonly existing: ReadonlyArray<McpServerConfig>;
  readonly onClose: () => void;
  readonly onImport: (configs: ReadonlyArray<McpServerConfig>) => void;
}) {
  const gt = useGT();
  const fieldId = useId();
  const [text, setText] = useState("");
  const parsed = text.trim() === "" ? null : parseMcpServersImport(text, props.existing);
  const found = parsed !== null && "servers" in parsed ? parsed : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            <T>Import MCP servers</T>
          </DialogTitle>
          <DialogDescription>
            <T>
              Paste the object with an mcpServers key from Claude Desktop, Claude Code or Cursor.
              Variable and header values are stored as secrets.
            </T>
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-json`}>
              <T>JSON</T>
            </Label>
            <Textarea
              id={`${fieldId}-json`}
              rows={8}
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          {parsed !== null && "error" in parsed ? (
            <Text render={<p role="alert" />} variant="meta" tone="destructive">
              {parsed.error}
            </Text>
          ) : null}
          {found !== null ? (
            <div className="grid gap-2">
              {found.servers.length > 0 ? (
                <ul aria-label={gt("Servers to add")} className="grid gap-1">
                  {found.servers.map((server) => {
                    const secrets =
                      server.transport.type === "stdio"
                        ? server.transport.env.length
                        : server.transport.headers.length;
                    return (
                      <li key={server.name} className="grid min-w-0">
                        <Text variant="label" truncate>
                          {server.name}
                        </Text>
                        <Text variant="meta" tone="muted" truncate>
                          {server.transport.type === "stdio"
                            ? gt(
                                "{count, plural, =0 {Runs {command}} one {Runs {command}, # secret} other {Runs {command}, # secrets}}",
                                { count: secrets, command: server.transport.command },
                              )
                            : gt(
                                "{count, plural, =0 {Connects to {url}} one {Connects to {url}, # secret} other {Connects to {url}, # secrets}}",
                                { count: secrets, url: server.transport.url },
                              )}
                        </Text>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {found.plainSecrets.length > 0 ? (
                <Text render={<p />} variant="meta" tone="muted">
                  {gt(
                    "{names} may hold a secret in an argument or the URL, which settings keep as plain text. Move it to a variable or header if the server reads one.",
                    { names: found.plainSecrets.join(", ") },
                  )}
                </Text>
              ) : null}
              {found.skipped.length > 0 ? (
                <ul aria-label={gt("Servers left out")} className="grid gap-1">
                  {found.skipped.map((entry) => (
                    <li key={entry.name} className="grid min-w-0">
                      <Text variant="label" tone="muted" truncate>
                        {entry.name}
                      </Text>
                      <span className="text-meta text-muted-foreground wrap-anywhere">
                        {entry.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={props.onClose}>
            <T>Cancel</T>
          </Button>
          <Button
            type="button"
            disabled={found === null || found.servers.length === 0}
            onClick={() => found !== null && props.onImport(found.servers)}
          >
            {gt("{count, plural, one {Add # server} other {Add # servers}}", {
              count: found?.servers.length ?? 0,
            })}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
