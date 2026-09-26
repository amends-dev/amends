import { paths } from "@amends/client";
import { Inbox } from "@amends/features/conversations";
import { useParams } from "@solidjs/router";

const href = (path: string) => `#${path}`;
/** The reader's inbox; the workspace layout shows a thread opened from it beside it. */
export function InboxPage() {
  const params = useParams<{ workspaceId: string; threadId?: string }>();
  return (
    <Inbox
      workspaceId={params.workspaceId}
      threadHref={(groupId, threadId) =>
        href(paths.inboxThread(params.workspaceId, groupId, threadId))
      }
      currentThread={params.threadId}
    />
  );
}
