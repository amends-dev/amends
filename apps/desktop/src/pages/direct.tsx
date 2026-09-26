import { paths } from "@amends/client";
import { DirectDraft } from "@amends/features/conversations";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { For } from "solid-js";

/**
 * A first message to the people in `?to=`, who have no conversation together yet. Once it starts
 * theirs, or theirs turns out to exist, their group replaces this page in history.
 */
export function DirectPage() {
  const params = useParams<{ workspaceId: string }>();
  const [search] = useSearchParams<{ to?: string }>();
  const navigate = useNavigate();
  return (
    <For each={[search.to ?? ""]}>
      {(to) => (
        <DirectDraft
          workspaceId={params.workspaceId}
          memberIds={to.split(",").filter(Boolean)}
          onGroup={(groupId) =>
            navigate(paths.group(params.workspaceId, groupId), { replace: true })
          }
        />
      )}
    </For>
  );
}
