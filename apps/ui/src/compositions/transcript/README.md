# Transcript

A conversation's ordered column, oldest first, with day seams and a control for reading
earlier entries.

```tsx
import { Transcript } from "@amends/ui/compositions/transcript";

<Transcript.Root aria-label="Design">
  <Transcript.Earlier>
    <Button variant="ghost" onClick={loadEarlier}>
      Show earlier threads
    </Button>
  </Transcript.Earlier>
  <Transcript.Items>
    <Transcript.Day>Today</Transcript.Day>
    <Transcript.Entry>{/* a Message */}</Transcript.Entry>
  </Transcript.Items>
</Transcript.Root>;
```

Root is a `section` region; name it with `aria-label`. Items is an ordered list of Day and Entry
items. Day is a centered seam with a mono label; Entry usually holds a Message. Earlier sits
above the list for a control or a note.

Items keeps the reader's place in its nearest scrolling ancestor, or the document. The view
opens at the newest end and stays there as entries arrive while the reader is there, measured
against the height before each change. Otherwise, entries added or resized anywhere keep the
first visible entry where it was, as browser scroll anchoring does. Day seams never anchor,
because one can stay first while entries arrive after it. The list turns off native anchoring
and does this itself, so it works the same in WebKit, which has none. The scroller is found once
the list is laid out, and again if it moves, as Inspector content does between its dock and
sheet. Callers key entries by domain ID, so refreshes keep each entry's element.

The Default story's play test runs in a real browser: it opens at the newest entry, keeps the
first visible entry in place while earlier entries arrive, and follows new entries at the end.
**Thread panel** shows compact messages in the shell's inspector.
