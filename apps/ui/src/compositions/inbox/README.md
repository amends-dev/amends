# Inbox

What has come to the reader, newest first, as the Home reference's "Needs you" cards.

```tsx
import { Inbox } from "@amends/ui/compositions/inbox";
import { Button } from "@amends/ui/primitives/button";

<Inbox.Root aria-label="Inbox">
  <Inbox.Item current>
    <Inbox.Header>
      <Inbox.Unread label="new" />
      <Inbox.Reason>Rae mentioned you · #finance</Inbox.Reason>
      <Inbox.Meta>2h ago</Inbox.Meta>
    </Inbox.Header>
    <Inbox.Quote>Is this refund inside the 30-day window, or an exception?</Inbox.Quote>
    <Inbox.Actions>
      <Inbox.Open href="/threads/one" aria-current="page">
        Open thread
      </Inbox.Open>
      <Button variant="secondary">Mark seen</Button>
    </Inbox.Actions>
  </Inbox.Item>
</Inbox.Root>;
```

Root is a list; name it with `aria-label`. Each Item is a card on the panel surface with the
reference's 18px padding, 12px radius, and 10px gaps. Header holds an optional `Unread` dot (the
reference's amber pending mark, named by its `label`), the `Reason` it came to the reader in 11.5px
mono, and `Meta` pushed to the end in 11px mono. `Quote` is what was said, in the reference's 20px
serif italic, clamped to three lines; `Note` is plain secondary text in its place, such as when
there is nothing to show. Actions holds links and buttons side by side and wraps.

`Open` is the link to what the notification points to, shaped and colored like a primary Button,
which cannot be a link; set `aria-current` while it is open. Mark `seen` on an Item once the reader
has seen it, which recedes its quote to secondary text, and `current` while it is open beside the
list, which outlines the card. Do not nest the card in a link: its actions are separate controls.

The stories cover pending, open, seen, and unavailable cards in both themes, narrow, RTL, and
enlarged text; Default checks the list, dots, links, and buttons by role.
