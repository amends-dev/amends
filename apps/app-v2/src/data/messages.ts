/** Plain text of stored messages, for search and accessible summaries. */

import { ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { markdownWords } from "@amends-dev/markdown"

export const deletedMessageText = "Message deleted"

export const messageWords = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): string =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ text }) => markdownWords({ text, mentions: members }),
    Deleted: () => deletedMessageText
  })
