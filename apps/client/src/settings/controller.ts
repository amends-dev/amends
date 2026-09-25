import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Cause, Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isUnauthorized } from "../api/client.ts";
import {
  settingsReads,
  settingsRequest,
  settingsFailure,
  type SettingsCommand,
  type SettingsData,
  type SettingsReads,
  type SettingsSection,
} from "../api/settings.ts";
import { useSession } from "../session/provider.tsx";

export interface SettingsController {
  /** The latest settings, kept while a refresh runs or fails. */
  readonly data: Accessor<SettingsData | undefined>;
  /** A command is running, or the first read has not arrived. */
  readonly pending: Accessor<boolean>;
  readonly error: Accessor<string | undefined>;
  /** The last command completed and its results are shown. */
  readonly saved: Accessor<boolean>;
  /** Commands wait until an explicit refresh shows the latest values. */
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
  error: () => "This workspace is unavailable.",
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
  const session = useSession();
  const request = settingsRequest(useApiClient(), workspaceId, section);
  const result = useAtomValue(() => request),
    execute = useAtomSet(() => request);
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
  const [pending, setPending] = createSignal(false),
    [error, setError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false),
    [needsRefresh, setNeedsRefresh] = createSignal(false),
    [revision, setRevision] = createSignal(0);
  let alive = true,
    sequence = 0,
    active: number | undefined,
    explicit = false;
  onCleanup(() => {
    alive = false;
    active = undefined;
  });

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
  createEffect(() => {
    const cause = loadFailure();
    if (alive && cause && isUnauthorized(cause)) session.replace(undefined);
  });

  const send = (command: SettingsCommand) => {
    if (
      !alive ||
      !session.isCurrent() ||
      pending() ||
      (needsRefresh() && command.kind !== "refresh")
    )
      return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    explicit = command.kind === "refresh";
    active = ++sequence;
    execute({ attempt: active, command });
  };
  createEffect(
    on(result, (outcome) => {
      if (
        !alive ||
        !session.isCurrent() ||
        active === undefined ||
        outcome.waiting ||
        AsyncResult.isInitial(outcome)
      )
        return;
      if (AsyncResult.isSuccess(outcome) && outcome.value.attempt !== active) return;
      active = undefined;
      setPending(false);
      const exit = AsyncResult.isSuccess(outcome)
        ? outcome.value.exit
        : Exit.failCause(outcome.cause);
      const completed = AsyncResult.isSuccess(outcome) && outcome.value.completed;
      if (Exit.isFailure(exit)) {
        if (isUnauthorized(exit.cause)) {
          session.replace(undefined);
          return;
        }
        setNeedsRefresh(true);
        setError(
          completed
            ? "Saved, but the latest data could not be loaded. Refresh to continue."
            : settingsFailure(exit.cause),
        );
      } else {
        setNeedsRefresh(false);
        setSaved(completed);
        if (explicit) setRevision((value) => value + 1);
      }
    }),
  );
  return {
    data,
    pending: () => pending() || (data() === undefined && loadFailure() === undefined),
    error: () => {
      const failure = loadFailure();
      if (error() !== undefined || failure === undefined) return error();
      return data() === undefined
        ? settingsFailure(failure)
        : "The latest settings could not be loaded. Try again.";
    },
    saved,
    needsRefresh: () => needsRefresh() || (data() === undefined && loadFailure() !== undefined),
    revision,
    send,
    refresh: () => send({ kind: "refresh" }),
  };
}
