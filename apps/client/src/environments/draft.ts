import type { Environment } from "../api/environments.ts";

/** What releasing a sandbox does: stop it and keep its files, or destroy it. */
export type Retention = "stop" | "destroy";

/** An environment variable as a row being edited; the ID keeps its row across edits. */
export interface VariableRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}
/** A setup command as a row being edited, run in list order. */
export interface CommandRow {
  readonly id: string;
  readonly command: string;
}

/** Sandbox settings as a form edits them, before they are checked and saved. */
export interface SandboxDraft {
  readonly accountId: string | undefined;
  readonly template: string;
  readonly variables: ReadonlyArray<VariableRow>;
  readonly commands: ReadonlyArray<CommandRow>;
  readonly retention: Retention;
}

/** The most variables and setup commands an environment holds. */
export const limit = 50;

/** Why a variable row would be refused: a key that is not a name, or one set above it. */
export type VariableIssue = "invalid" | "duplicate";

let rows = 0;
const rowId = () => `row-${++rows}`;

export const empty = (): SandboxDraft => ({
  accountId: undefined,
  template: "",
  variables: [],
  commands: [],
  retention: "stop",
});

/** A saved sandbox as a draft to edit. */
export const fromSandbox = (sandbox: Environment.Sandbox): SandboxDraft => ({
  accountId: sandbox.connectionId ?? undefined,
  template: sandbox.template ?? "",
  variables: Object.entries(sandbox.env).map(([key, value]) => ({ id: rowId(), key, value })),
  commands: sandbox.setup.map((command) => ({ id: rowId(), command })),
  retention: sandbox.retention,
});

const isKey = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
/** A row with neither a key nor a value is left out rather than refused. */
const blank = (row: VariableRow) => row.key.trim() === "" && row.value === "";

/** Each variable row's issue, by row ID. */
export const variableIssues = (draft: SandboxDraft): ReadonlyMap<string, VariableIssue> => {
  const issues = new Map<string, VariableIssue>();
  const seen = new Set<string>();
  for (const row of draft.variables) {
    if (blank(row)) continue;
    const key = row.key.trim();
    if (!isKey.test(key)) issues.set(row.id, "invalid");
    else if (seen.has(key)) issues.set(row.id, "duplicate");
    seen.add(key);
  }
  return issues;
};

/**
 * The settings a draft saves as: blank variable rows and commands left out, text trimmed. The
 * account is kept only when the provider runs under one, and the template when it takes one.
 */
export const settings = (
  draft: SandboxDraft,
  provider: { readonly account: boolean; readonly template: boolean },
): Environment.SandboxSettings => ({
  connectionId: provider.account
    ? ((draft.accountId ?? null) as Environment.SandboxSettings["connectionId"])
    : null,
  template: provider.template && draft.template.trim() !== "" ? draft.template.trim() : null,
  env: Object.fromEntries(
    draft.variables.filter((row) => !blank(row)).map((row) => [row.key.trim(), row.value]),
  ),
  setup: draft.commands.map((row) => row.command.trim()).filter((command) => command !== ""),
  retention: draft.retention,
});

/** Whether a draft can be saved: its variables are valid, and it names an account if it needs one. */
export const valid = (draft: SandboxDraft, provider: { readonly account: boolean }) =>
  variableIssues(draft).size === 0 && (!provider.account || draft.accountId !== undefined);

/** The draft with one change applied: the edits a sandbox form makes. */
export const edit = {
  account: (draft: SandboxDraft, accountId: string | undefined): SandboxDraft =>
    Object.assign({}, draft, { accountId }),
  template: (draft: SandboxDraft, template: string): SandboxDraft =>
    Object.assign({}, draft, { template }),
  retention: (draft: SandboxDraft, retention: Retention): SandboxDraft =>
    Object.assign({}, draft, { retention }),
  addVariable: (draft: SandboxDraft): SandboxDraft =>
    draft.variables.length >= limit
      ? draft
      : Object.assign({}, draft, {
          variables: [...draft.variables, { id: rowId(), key: "", value: "" }],
        }),
  variable: (
    draft: SandboxDraft,
    id: string,
    change: { readonly key?: string; readonly value?: string },
  ): SandboxDraft =>
    Object.assign({}, draft, {
      variables: draft.variables.map((row) =>
        row.id === id ? Object.assign({}, row, change) : row,
      ),
    }),
  removeVariable: (draft: SandboxDraft, id: string): SandboxDraft =>
    Object.assign({}, draft, { variables: draft.variables.filter((row) => row.id !== id) }),
  addCommand: (draft: SandboxDraft): SandboxDraft =>
    draft.commands.length >= limit
      ? draft
      : Object.assign({}, draft, { commands: [...draft.commands, { id: rowId(), command: "" }] }),
  command: (draft: SandboxDraft, id: string, command: string): SandboxDraft =>
    Object.assign({}, draft, {
      commands: draft.commands.map((row) => (row.id === id ? { id, command } : row)),
    }),
  /** Move a command one place earlier or later. */
  moveCommand: (draft: SandboxDraft, id: string, by: -1 | 1): SandboxDraft => {
    const index = draft.commands.findIndex((row) => row.id === id);
    const target = index + by;
    if (index < 0 || target < 0 || target >= draft.commands.length) return draft;
    const commands = [...draft.commands];
    const [moved] = commands.splice(index, 1);
    if (moved) commands.splice(target, 0, moved);
    return Object.assign({}, draft, { commands });
  },
  removeCommand: (draft: SandboxDraft, id: string): SandboxDraft =>
    Object.assign({}, draft, { commands: draft.commands.filter((row) => row.id !== id) }),
};

/** Whether two drafts save as the same settings. */
export const same = (
  left: SandboxDraft,
  right: SandboxDraft,
  provider: { readonly account: boolean; readonly template: boolean },
) => JSON.stringify(settings(left, provider)) === JSON.stringify(settings(right, provider));

export * as SandboxDrafts from "./draft.ts";
