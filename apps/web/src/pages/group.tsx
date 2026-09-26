import { paths } from "@amends/client";
import { GroupStream } from "@amends/features/conversations";
import { useParams } from "@solidjs/router";
import { Show } from "solid-js";

const href = (path: string) => path;
/** A group's stream; the workspace layout shows an open thread beside it. */
export function GroupPage() {
  const params = useParams<{ workspaceId: string; groupId: string; threadId?: string }>();
  return (
    <Show when={params.groupId} keyed>
      {(groupId) => (
        <GroupStream
          workspaceId={params.workspaceId}
          groupId={groupId}
          label="Conversation"
          threadHref={(threadId) => href(paths.thread(params.workspaceId, groupId, threadId))}
          currentThread={params.threadId}
        />
      )}
    </Show>
  );
}
