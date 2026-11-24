import { useAtomValue } from "@effect/atom-react";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@dacre/client-runtime/state/runtime";
import {
  BRAIN_BODY_MAX_CHARS,
  BRAIN_KINDS,
  BRAIN_TITLE_MAX_CHARS,
  type BrainEntry,
  type BrainKind,
  type BrainListResult,
  type EnvironmentId,
  type ProjectId,
} from "@dacre/contracts";
import { msg, T, useGT, useMessages } from "gt-react";
import {
  BrainIcon,
  CircleAlertIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import * as Predicate from "effect/Predicate";
import { useState, type ReactNode } from "react";

import { deleteConfirm, requestConfirmDialog } from "../../confirmDialog";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { brainEnvironment } from "../../state/brain";
import { useProjects } from "../../state/entities";
import {
  useConnectedEnvironmentIds,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "../../state/environments";
import { useDebouncedValue } from "../../state/queries";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { PANE_TAB_CLASS, PaneNotch } from "../PaneNotch";
import { RelativeTime } from "../RelativeTime";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button, ContentButton } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Text } from "../ui/text";
import { Textarea } from "../ui/textarea";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  brainDraftFrom,
  brainListInput,
  brainSaveInput,
  type BrainScopeFilter,
  isSavableBrainDraft,
  scopeFilterProject,
  scopeFilterValue,
} from "./brainPage.logic";

const EVERY_KIND = "all";
const SEARCH_DEBOUNCE_MS = 200;
// Past this share of the limit the body field shows how much room is left.
const BODY_COUNTER_FROM = BRAIN_BODY_MAX_CHARS * 0.9;

const KIND_LABELS: Record<BrainKind, string> = {
  instruction: msg("Instruction", { $context: "kind of saved Brain entry" }),
  convention: msg("Convention", { $context: "kind of saved Brain entry" }),
  architecture: msg("Architecture", { $context: "kind of saved Brain entry" }),
  decision: msg("Decision", { $context: "kind of saved Brain entry" }),
  issue: msg("Issue", { $context: "kind of saved Brain entry, a known problem" }),
  solution: msg("Solution", { $context: "kind of saved Brain entry" }),
  task: msg("Task", { $context: "kind of saved Brain entry" }),
  note: msg("Note", { $context: "kind of saved Brain entry" }),
};

interface ScopeOption {
  readonly id: ProjectId;
  readonly title: string;
}

/** A failed command's text in the user's language where the failure is one the page expects. */
function useBrainFailureText() {
  const gt = useGT();
  return (failure: unknown) => {
    if (Predicate.isTagged(failure, "BrainCredentialError")) {
      return gt(
        "That looks like a password, token or private key. Brain does not store secrets, so nothing was saved.",
      );
    }
    if (Predicate.isTagged(failure, "BrainEntryNotFoundError")) {
      return gt("This entry no longer exists.");
    }
    return failure instanceof Error ? failure.message : gt("The request failed.");
  };
}

export function BrainPage() {
  const gt = useGT();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const connectedIds = useConnectedEnvironmentIds();
  const { environments } = useEnvironments();
  const connected = environments.filter((environment) =>
    connectedIds.includes(environment.environmentId),
  );
  const [pickedEnvironmentId, setPickedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId =
    connected.find(
      (environment) => environment.environmentId === (pickedEnvironmentId ?? primaryEnvironmentId),
    )?.environmentId ??
    connected[0]?.environmentId ??
    null;
  const environmentPicker =
    connected.length > 1 && environmentId !== null ? (
      <Select
        value={environmentId}
        onValueChange={(value) => {
          if (value !== null) setPickedEnvironmentId(value);
        }}
      >
        <SelectTrigger
          aria-label={gt("Environment", { $context: "a Dacre server to pick" })}
          size="compact"
          variant="ghost"
          className="w-auto min-w-0"
        >
          <SelectValue>
            {connected.find((environment) => environment.environmentId === environmentId)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {connected.map((environment) => (
            <SelectItem key={environment.environmentId} value={environment.environmentId}>
              {environment.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    ) : null;

  return (
    <SidebarInset
      {...workspaceAreaProps("brain", 1, gt("Brain"))}
      role="main"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        {environmentId === null ? (
          <>
            <BrainHeader />
            <BrainNotice
              title={gt("No environment connected")}
              description={gt("Connect an environment to see what it remembers.")}
            />
          </>
        ) : (
          <BrainWorkspace
            key={environmentId}
            environmentId={environmentId}
            environmentPicker={environmentPicker}
          />
        )}
      </div>
    </SidebarInset>
  );
}

function BrainHeader({ children }: { readonly children?: ReactNode }) {
  return (
    <WorkspacePageHeader
      electron={isElectron}
      className="relative z-10 md:pl-0"
      data-pane-header=""
    >
      <div className="flex w-full min-w-0 items-center gap-3 self-stretch">
        <PaneNotch>
          <h1 className={PANE_TAB_CLASS}>
            <BrainIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="max-sm:sr-only">
              <T>Brain</T>
            </span>
          </h1>
        </PaneNotch>
        {children}
      </div>
    </WorkspacePageHeader>
  );
}

function BrainNotice({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <Empty size="compact">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BrainIcon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action}
      </Empty>
    </div>
  );
}

function BrainWorkspace({
  environmentId,
  environmentPicker,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentPicker: ReactNode;
}) {
  const gt = useGT();
  const m = useMessages();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<BrainKind | null>(null);
  const [scope, setScope] = useState<BrainScopeFilter>("all");
  const [selection, setSelection] = useState<BrainEntry | "new" | null>(null);
  const searched = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const live = useEnvironmentQuery(
    brainEnvironment.live({
      environmentId,
      input: brainListInput({ query: searched, kind, scope }),
    }),
    m,
  );
  // Each search is its own subscription, so the last answer stays up while the next one loads.
  const [lastResult, setLastResult] = useState<BrainListResult | null>(null);
  if (live.data !== null && live.data !== lastResult) setLastResult(live.data);
  const result = live.data ?? lastResult;
  const canEdit = useAtomValue(brainEnvironment.save.permissionAtom(environmentId));
  const allProjects = useProjects().filter((project) => project.environmentId === environmentId);
  const scopeOptions: ReadonlyArray<ScopeOption> = allProjects
    .filter((project) => !project.archivedAt && project.isScratch !== true)
    .map((project) => ({ id: project.id, title: project.title }));
  const projectTitle = (projectId: ProjectId) =>
    allProjects.find((project) => project.id === projectId)?.title ?? gt("Unknown project");
  const scopeLabel = (projectId: ProjectId | null) =>
    projectId === null ? gt("Global") : projectTitle(projectId);

  const entries = result?.entries ?? [];
  const total = result?.total ?? 0;
  // An entry a filter hides stays open, so changing the filter cannot lose an edit in progress.
  const current =
    selection === null || selection === "new"
      ? selection
      : (entries.find((entry) => entry.id === selection.id) ?? selection);
  const filtering = searched.trim() !== "" || kind !== null || scope !== "all";
  const clearFilters = () => {
    setQuery("");
    setKind(null);
    setScope("all");
  };
  const scopeProject = scopeFilterProject(scope);

  return (
    <>
      <BrainHeader>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 [-webkit-app-region:no-drag]">
          <div className="min-w-16 flex-1 md:max-w-64">
            <Input
              type="search"
              size="compact"
              aria-label={gt("Search Brain")}
              placeholder={gt("Search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            value={kind ?? EVERY_KIND}
            onValueChange={(value) => {
              setKind(value === null || value === EVERY_KIND ? null : (value as BrainKind));
            }}
          >
            <SelectTrigger
              aria-label={gt("Filter by kind")}
              size="compact"
              variant="ghost"
              className="w-auto min-w-0"
            >
              <SelectValue>{kind === null ? gt("All kinds") : m(KIND_LABELS[kind])}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value={EVERY_KIND}>
                <T>All kinds</T>
              </SelectItem>
              {BRAIN_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {m(KIND_LABELS[value])}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Select
            value={scope}
            onValueChange={(value) => {
              if (value !== null) setScope(value as BrainScopeFilter);
            }}
          >
            <SelectTrigger
              aria-label={gt("Filter by scope")}
              size="compact"
              variant="ghost"
              className="w-auto min-w-0 max-w-40"
            >
              <SelectValue>
                {scope === "all" ? gt("All scopes") : scopeLabel(scopeProject ?? null)}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="all">
                <T>All scopes</T>
              </SelectItem>
              <SelectItem value={scopeFilterValue(null)}>
                <T>Global</T>
              </SelectItem>
              {scopeOptions.map((project) => (
                <SelectItem key={project.id} value={scopeFilterValue(project.id)}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {environmentPicker}
          <Button size="xs" disabled={!canEdit} onClick={() => setSelection("new")}>
            <PlusIcon />
            <T context="create a new Brain entry">New</T>
          </Button>
        </div>
      </BrainHeader>
      <div className="@container/brain flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col @2xl/brain:flex-row">
          <section
            aria-label={gt("Brain entries")}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {live.error !== null && live.data === null ? (
              <BrainNotice
                title={gt("Could not load Brain")}
                description={live.error}
                action={
                  <Button size="xs" variant="secondary" onClick={live.refresh}>
                    <T>Retry</T>
                  </Button>
                }
              />
            ) : result === null ? (
              <BrainListSkeleton />
            ) : entries.length === 0 ? (
              filtering ? (
                <BrainNotice
                  title={gt("No matching entries")}
                  description={gt("Try other words, or clear the filters.")}
                  action={
                    <Button size="xs" variant="secondary" onClick={clearFilters}>
                      <T>Clear filters</T>
                    </Button>
                  }
                />
              ) : (
                <BrainNotice
                  title={gt("Nothing saved yet")}
                  description={gt(
                    "Save conventions, decisions and known issues here. Agents read them and add what they learn.",
                  )}
                  action={
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={!canEdit}
                      onClick={() => setSelection("new")}
                    >
                      <PlusIcon />
                      <T>New entry</T>
                    </Button>
                  }
                />
              )
            ) : (
              <>
                <ScrollArea className="min-h-0 flex-1">
                  <ul className="*:not-first:border-t *:not-first:border-divider">
                    {entries.map((entry) => (
                      <BrainEntryRow
                        key={entry.id}
                        entry={entry}
                        scope={scopeLabel(entry.projectId)}
                        selected={current !== "new" && current?.id === entry.id}
                        onSelect={() => setSelection(entry)}
                      />
                    ))}
                  </ul>
                </ScrollArea>
                {total > entries.length ? (
                  <p className="shrink-0 border-t border-divider px-4 py-1.5 text-meta text-muted-foreground">
                    {gt("Showing the newest {shown} of {total}. Search to find the rest.", {
                      shown: entries.length,
                      total,
                    })}
                  </p>
                ) : null}
              </>
            )}
          </section>
          {current === null ? null : (
            <section
              aria-label={current === "new" ? gt("New entry") : gt("Edit entry")}
              className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-divider transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none @2xl/brain:max-w-[32rem] @2xl/brain:border-s @2xl/brain:border-t-0"
            >
              <BrainEditor
                // A save or an edit from elsewhere starts the form again from what is stored.
                key={current === "new" ? "new" : `${current.id}:${current.updatedAt}`}
                environmentId={environmentId}
                entry={current === "new" ? null : current}
                defaultProjectId={scopeProject ?? null}
                scopeOptions={scopeOptions}
                scopeLabel={scopeLabel}
                canEdit={canEdit}
                onSaved={setSelection}
                onClose={() => setSelection(null)}
              />
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function BrainListSkeleton() {
  const gt = useGT();
  return (
    <div
      role="status"
      aria-label={gt("Loading Brain")}
      className="*:not-first:border-t *:not-first:border-divider"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex flex-col gap-1.5 px-4 py-2.5">
          <Skeleton className="h-3.5 w-48 max-w-full" />
          <Skeleton className="h-3 w-32 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function BrainEntryRow({
  entry,
  scope,
  selected,
  onSelect,
}: {
  readonly entry: BrainEntry;
  readonly scope: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  const m = useMessages();
  return (
    <li>
      <ContentButton
        aria-current={selected ? "true" : undefined}
        className="group/row block w-full cursor-pointer text-start"
        onClick={onSelect}
      >
        <span
          className={cn(
            "flex w-full min-w-0 flex-col gap-0.5 px-4 py-2 group-focus-visible/row:ring-2 group-focus-visible/row:ring-ring/70 group-focus-visible/row:ring-inset",
            selected ? "surface-selected" : "group-hover/row:surface-ghost-hover",
            !entry.enabled && "opacity-55",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {entry.pinned ? (
              <PinIcon
                aria-label={gt("Pinned")}
                className="size-3 shrink-0 text-muted-foreground"
              />
            ) : null}
            <Text variant="label" truncate>
              {entry.title}
            </Text>
          </span>
          <span className="flex min-w-0 items-baseline gap-2.5 text-meta text-muted-foreground">
            <span className="shrink-0">{m(KIND_LABELS[entry.kind])}</span>
            <span className="shrink-0">
              {entry.source === "agent"
                ? gt("Agent", { $context: "who added this entry" })
                : gt("You")}
            </span>
            <span className="min-w-0 truncate">{scope}</span>
            {entry.enabled ? null : (
              <span className="shrink-0">
                <T context="this entry is turned off">Off</T>
              </span>
            )}
            <span className="ms-auto shrink-0 tabular-nums">
              <RelativeTime timestamp={entry.updatedAt} />
            </span>
          </span>
        </span>
      </ContentButton>
    </li>
  );
}

function BrainEditor({
  environmentId,
  entry,
  defaultProjectId,
  scopeOptions,
  scopeLabel,
  canEdit,
  onSaved,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly entry: BrainEntry | null;
  readonly defaultProjectId: ProjectId | null;
  readonly scopeOptions: ReadonlyArray<ScopeOption>;
  readonly scopeLabel: (projectId: ProjectId | null) => string;
  readonly canEdit: boolean;
  readonly onSaved: (entry: BrainEntry) => void;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const failureText = useBrainFailureText();
  const [draft, setDraft] = useState(() => brainDraftFrom(entry, defaultProjectId));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const save = useAtomCommand(brainEnvironment.save, {
    label: "save brain entry",
    reportFailure: false,
  });
  const setPinned = useAtomCommand(brainEnvironment.setPinned, { label: "pin brain entry" });
  const setEnabled = useAtomCommand(brainEnvironment.setEnabled, { label: "enable brain entry" });
  const remove = useAtomCommand(brainEnvironment.remove, { label: "delete brain entry" });
  // An option for a scope that left the picker, such as an archived project, so the value shows.
  const scopes =
    draft.projectId === null || scopeOptions.some((option) => option.id === draft.projectId)
      ? scopeOptions
      : [...scopeOptions, { id: draft.projectId, title: scopeLabel(draft.projectId) }];

  /** Runs one command at a time, keeping the form's failure line current. */
  const run = async <A, E>(
    command: () => Promise<AtomCommandResult<A, E>>,
    onSuccess?: (value: A) => void,
  ) => {
    setBusy(true);
    setFailure(null);
    const result = await command();
    setBusy(false);
    if (result._tag === "Success") onSuccess?.(result.value);
    else setFailure(failureText(squashAtomCommandFailure(result)));
  };

  const submit = () =>
    run(() => save({ environmentId, input: brainSaveInput(draft, entry) }), onSaved);

  const confirmDelete = async () => {
    if (entry === null) return;
    const message = `${gt('Delete "{title}"?', { title: entry.title })}\n${gt("This cannot be undone.")}`;
    const confirmed =
      (await requestConfirmDialog(
        message,
        deleteConfirm({ variant: "destructive", confirmLabel: gt("Delete") }),
      )) ?? window.confirm(message);
    if (!confirmed) return;
    await run(() => remove({ environmentId, input: { id: entry.id } }), onClose);
  };

  const editable = canEdit && !busy;
  const titleId = `brain-title-${environmentId}`;
  const bodyId = `brain-body-${environmentId}`;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable && isSavableBrainDraft(draft, entry)) void submit();
      }}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {failure === null ? null : (
            <Alert variant="error" density="strip">
              <CircleAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
              <AlertAction>
                <Button size="xs" variant="ghost" onClick={() => setFailure(null)}>
                  <T>Dismiss</T>
                </Button>
              </AlertAction>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={titleId}>
              <T>Title</T>
            </Label>
            <Input
              id={titleId}
              value={draft.title}
              maxLength={BRAIN_TITLE_MAX_CHARS}
              disabled={!editable}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>
                <T context="kind of saved Brain entry">Kind</T>
              </Label>
              <Select
                value={draft.kind}
                disabled={!editable}
                onValueChange={(value) => {
                  if (value !== null) setDraft({ ...draft, kind: value as BrainKind });
                }}
              >
                <SelectTrigger size="sm" aria-label={gt("Kind")} className="min-w-0">
                  <SelectValue>{m(KIND_LABELS[draft.kind])}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {BRAIN_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {m(KIND_LABELS[value])}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>
                <T context="which projects a saved Brain entry applies to">Scope</T>
              </Label>
              <Select
                value={scopeFilterValue(draft.projectId)}
                disabled={!editable}
                onValueChange={(value) => {
                  if (value === null) return;
                  setDraft({
                    ...draft,
                    projectId: scopeFilterProject(value as BrainScopeFilter) ?? null,
                  });
                }}
              >
                <SelectTrigger size="sm" aria-label={gt("Scope")} className="min-w-0">
                  <SelectValue>{scopeLabel(draft.projectId)}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value={scopeFilterValue(null)}>
                    <T>Global</T>
                  </SelectItem>
                  {scopes.map((project) => (
                    <SelectItem key={project.id} value={scopeFilterValue(project.id)}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={bodyId} className="flex items-baseline justify-between">
              <span>
                <T>Body</T>
              </span>
              {draft.body.length >= BODY_COUNTER_FROM ? (
                <Text variant="caption" tone="muted" numeric>
                  {`${draft.body.length.toLocaleString()} / ${BRAIN_BODY_MAX_CHARS.toLocaleString()}`}
                </Text>
              ) : null}
            </Label>
            <Textarea
              id={bodyId}
              rows={8}
              value={draft.body}
              maxLength={BRAIN_BODY_MAX_CHARS}
              disabled={!editable}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </div>
          {entry === null ? (
            <Text variant="meta" tone="muted" render={<p />}>
              <T>Agents can read this in any thread it applies to. Never store secrets here.</T>
            </Text>
          ) : (
            <Text variant="meta" tone="muted" render={<p />}>
              {entry.source === "agent"
                ? gt("Added by an agent. Inferred, so check it before relying on it.")
                : gt("Added by you.")}
            </Text>
          )}
          {entry === null ? null : (
            <div className="flex flex-col border-t border-divider pt-3">
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="flex min-w-0 flex-col">
                  <Text variant="label">
                    <T>Enabled</T>
                  </Text>
                  <Text variant="meta" tone="muted">
                    <T>When off, agents do not see this entry.</T>
                  </Text>
                </span>
                <Switch
                  aria-label={gt("Enabled")}
                  checked={entry.enabled}
                  disabled={!editable}
                  onCheckedChange={(checked) => {
                    void run(
                      () =>
                        setEnabled({ environmentId, input: { id: entry.id, enabled: checked } }),
                      onSaved,
                    );
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <footer className="flex shrink-0 items-center gap-1.5 border-t border-divider px-4 py-2">
        {entry === null ? null : (
          <>
            <Button
              size="xs"
              variant="ghost"
              aria-pressed={entry.pinned}
              disabled={!editable}
              onClick={() => {
                void run(
                  () =>
                    setPinned({ environmentId, input: { id: entry.id, pinned: !entry.pinned } }),
                  onSaved,
                );
              }}
            >
              {entry.pinned ? <PinOffIcon /> : <PinIcon />}
              {entry.pinned ? <T>Unpin</T> : <T>Pin</T>}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!editable}
              onClick={() => void confirmDelete()}
            >
              <Trash2Icon />
              <T>Delete</T>
            </Button>
          </>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={onClose}>
            <T>Close</T>
          </Button>
          <Button
            size="xs"
            type="submit"
            disabled={!editable || !isSavableBrainDraft(draft, entry)}
          >
            <T context="save a Brain entry">Save</T>
          </Button>
        </div>
      </footer>
    </form>
  );
}
