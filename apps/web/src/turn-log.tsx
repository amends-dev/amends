import { paths, useTurnLog } from "@amends/client";
import { TurnLogPane } from "@amends/ui/screens/turns";

const href = (path: string) => path;

/** A turn's log in place of its thread: what it did, what it is writing, Stop and Retry. */
export function TurnLog(props: {
  readonly workspaceId: string;
  readonly turnId: string;
  /** Back to the turn's thread. */
  readonly onBack: () => void;
  readonly onClose: () => void;
  /** A retry queued this new turn, whose log shows next. */
  readonly onRetried: (turnId: string) => void;
  /** Opens the reply it posted; Back by default, for a log opened from its thread. */
  readonly onOpenReply?: () => void;
}) {
  const log = useTurnLog(props.workspaceId, props.turnId, { retried: props.onRetried });
  const turn = () => {
    const current = log.turn();
    return (
      current && { ...current, agentHref: href(paths.agent(props.workspaceId, current.agentId)) }
    );
  };
  const status = () => {
    if (log.loading()) return "loading" as const;
    const failure = turn() === undefined ? log.failure() : undefined;
    if (failure === undefined) return undefined;
    return failure === "gone" || failure === "denied"
      ? ("unavailable" as const)
      : ("failed" as const);
  };
  const acting = () => {
    const current = log.acting();
    return current?.turnId === props.turnId ? current.kind : undefined;
  };
  return (
    <TurnLogPane
      turn={turn()}
      activity={log.activity()}
      draft={log.draft()}
      status={status()}
      onRetryLoad={log.refresh}
      reconnecting={log.reconnecting()}
      updatedAt={log.updatedAt()}
      acting={acting()}
      problem={log.problem()?.problem}
      onStop={() => log.stop(props.turnId)}
      onRetry={() => log.retry(props.turnId)}
      onBack={props.onBack}
      onClose={props.onClose}
      onOpenReply={props.onOpenReply ?? props.onBack}
    />
  );
}
