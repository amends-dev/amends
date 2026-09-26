# Message

One entry of a conversation, from any kind of author, following the Agent messages reference.

```tsx
import { Message } from "@amends/ui/compositions/message";
import { Avatar } from "@amends/ui/primitives/avatar";

<Message.Root aria-labelledby="entry-author">
  <Message.Avatar>
    <Avatar.Root kind="human" decorative>
      <Avatar.Fallback>JM</Avatar.Fallback>
    </Avatar.Root>
  </Message.Avatar>
  <Message.Content>
    <Message.Header>
      <Message.Author id="entry-author">Jo Mercer</Message.Author>
      <Message.Time datetime="2026-09-22T13:58:00Z" title="Monday 22 September 2026, 13:58">
        13:58
      </Message.Time>
    </Message.Header>
    <Message.Body>Explain the reconcile script to me — what is it actually comparing?</Message.Body>
    <Message.Replies href="/threads/one" aria-current="page">
      <Message.ReplyCount>3 replies</Message.ReplyCount>
      <Message.ReplyNote>last at 14:05</Message.ReplyNote>
    </Message.Replies>
  </Message.Content>
</Message.Root>;
```

Root is an `article`; name it with `aria-labelledby` pointing at the Author. `density` is
`comfortable` (default) for a stream and `compact` for a narrow thread panel, with the reference's
smaller text and spacing. Avatar holds one decorative Avatar; the Author carries the name.

Mention sets a mentioned person's `@name` apart inside Body: emphasized on a soft wash, so it
reads as a reference to someone rather than an assignment. Callers decide which runs are
mentions.

Time is a `time` element: the visible text is short, `datetime` is required, and `title` can
carry the full instant. Body keeps the author's line breaks and indentation and wraps long words.

Replies is the link from an opening message to its thread, a pill whose text lines up with the
message. ReplyCount uses the link color (`text.link`); ReplyNote is secondary context, such as
when the last reply came or "reply in thread". Set `aria-current` while its thread is open, which
keeps the pill filled; hover and press use the shared action colors. Coarse pointers get a 44px
target. The stories cover the reference, all states on canvas and panel, Soot, narrow, RTL, and
enlarged text.
