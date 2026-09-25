import { useAtomValue } from "@effect/atom-solid";
import { Cause, Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isStale, workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import {
  settingsReads,
  settingsRequest,
  type SettingsCommand,
  type SettingsData,
  type SettingsReads,
  type SettingsSection,
} from "../api/settings.ts";
import { useRequest } from "../request/use-request.ts";

/**
 * A failure to show the reader: why a command failed, `refresh-failed` when a command completed
 * but its result could not be read back, or `outdated` when a live refresh failed.
 */
export type SettingsError = WorkspaceFailure | "refresh-failed" | "outdated";
export interface SettingsController {
  /** The latest settings, kept while a refresh runs or fails. */
  readonly data: Accessor<SettingsData | undefined>;
  /** A command is running, or the first read has not arrived. */
  readonly pending: Accessor<boolean>;
  readonly error: Accessor<SettingsError | undefined>;
  /** The last command completed and its results are shown. */
  readonly saved: Accessor<boolean>;
  /**
   * What the reader sees is known to be out of date, so commands wait for an explicit refresh.
   * Only stale failures set it; a failed request or invalid input can be retried at once.
   */
  readonly needsRefresh: Accessor<boolean>;
  /** Counts explicit refreshes, so editors can discard drafts made against older values. */
  readonly revision: Accessor<number>;
  readonly send: (command: SettingsCommand) => void;
  readonly refresh: () => void;
}

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined;
const unavailable: SettingsController = {
  data: () => undefined,
  pending: () => false,
  error: () => "gone",
  saved: () => false,
  needsRefresh: () => false,
  revision: () => 0,
  send: () => {},
  refresh: () => {},
};

/**
 * Mounted workspace/section scope; features remount it only when its identity changes. Reads
 * stay live while mounted: the workspace change feed and completed commands refresh them.
 */
export function useSettings(workspaceId: string, section: SettingsSection): SettingsController {
  const client = useApiClient();
  const reads = settingsReads(client, workspaceId);
  return reads ? connect(reads, workspaceId, section) : unavailable;
}

function connect(
  reads: SettingsReads,
  workspaceId: string,
  section: SettingsSection,
): SettingsController {
  const settings = useAtomValue(() => reads.settings),
    ownership = useAtomValue(() => reads.ownership),
    members = useAtomValue(() => reads.members(section === "members"));
  const canReadInvitations = createMemo(() =>
    Option.match(AsyncResult.value(settings()), {
      onNone: () => false,
      onSome: (view) => view.canReadInvitations,
    }),
  );
  const invitations = useAtomValue(() =>
    reads.invitations(section === "invites" && canReadInvitations()),
  );
  const [error, setError] = createSignal<SettingsError>();
  const [saved, setSaved] = createSignal(false),
    [needsRefresh, setNeedsRefresh] = createSignal(false),
    [revision, setRevision] = createSignal(0);

  // Keep the last complete view while reads refresh, so live updates never blank the page.
  const data = createMemo<SettingsData | undefined>((previous) => {
    const view = AsyncResult.value(settings()),
      owner = AsyncResult.value(ownership()),
      people = AsyncResult.value(members()),
      invites = AsyncResult.value(invitations());
    if (
      Option.isNone(view) ||
      Option.isNone(owner) ||
      Option.isNone(people) ||
      Option.isNone(invites)
    )
      return previous;
    return {
      settings: view.value,
      ownership: owner.value,
      members: people.value,
      invitations: invites.value,
    };
  });
  const loadFailure = createMemo(
    () =>
      settled(settings()) ?? settled(ownership()) ?? settled(members()) ?? settled(invitations()),
  );

  const request = useRequest(
    settingsRequest(useApiClient(), workspaceId, section),
    (exit, command) => {
      if (Exit.isFailure(exit)) {
        const failure = workspaceFailure(exit.cause);
        setError(failure);
        if (isStale(failure)) setNeedsRefresh(true);
        return;
      }
      const { refreshed } = exit.value;
      if (Exit.isFailure(refreshed)) {
        // A completed command's result is unknown here, so edits wait for it to load.
        if (command.kind !== "refresh") {
          setError("refresh-failed");
          setNeedsRefresh(true);
        } else setError(workspaceFailure(refreshed.cause));
        return;
      }
      setNeedsRefresh(false);
      setSaved(command.kind !== "refresh");
      if (command.kind === "refresh") setRevision((value) => value + 1);
    },
  );
  const send = (command: SettingsCommand) => {
    if (request.pending() || (needsRefresh() && command.kind !== "refresh")) return;
    setError(undefined);
    setSaved(false);
    request.run(command);
  };
  return {
    data,
    pending: () => request.pending() || (data() === undefined && loadFailure() === undefined),
    error: () => {
      const failure = loadFailure();
      if (error() !== undefined || failure === undefined) return error();
      return data() === undefined ? workspaceFailure(failure) : "outdated";
    },
    saved,
    needsRefresh: () => needsRefresh() || (data() === undefined && loadFailure() !== undefined),
    revision,
    send,
    refresh: () => send({ kind: "refresh" }),
  };
}
