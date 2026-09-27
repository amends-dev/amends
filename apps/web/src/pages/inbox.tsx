import { paths } from "@amends/client";
import { Inbox } from "@amends/features/conversations";
import { useParams } from "@solidjs/router";
import { LegacyPage } from "../legacy.tsx";

const href = (path: string) => path;
/** The reader's inbox; the workspace layout shows a thread opened from it beside it. */
export function InboxPage() {
  const params = useParams<{ workspaceId: string; threadId?: string }>();
  return (
    <LegacyPage title="Inbox">
      <Inbox
        workspaceId={params.workspaceId}
        threadHref={(groupId, threadId, sequence) =>
          href(paths.inboxThread(params.workspaceId, groupId, threadId, sequence))
        }
        currentThread={params.threadId}
      />
    </LegacyPage>
  );
}
