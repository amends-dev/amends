# Composer

Writing a message, following the Agent messages reference: a dashed box with the text and a send
action, and a line saying what sending does.

```tsx
import { Composer } from "@amends/ui/compositions/composer";
import { Button } from "@amends/ui/primitives/button";

<Composer.Dock>
  <Composer.Root onSend={send}>
    <Composer.Frame>
      <Composer.Input
        aria-label="Message #Design"
        aria-describedby="compose-note"
        placeholder="Message #Design"
        value={draft()}
        onInput={setDraft}
      />
      <Composer.Actions>
        <Button type="submit" variant="primary" disabled={!ready()}>
          Send
        </Button>
      </Composer.Actions>
    </Composer.Frame>
    <Composer.Note id="compose-note">Starts a new thread in #Design.</Composer.Note>
  </Composer.Root>
</Composer.Dock>;
```

Root is a form: submitting it, by the send button or Enter in the Input, calls `onSend`. The
caller owns the draft, sending, pending state, and outcome. `density="compact"` sets the thread
panel's smaller text.

Input is a textarea named by `aria-label` or `aria-labelledby`. Enter sends and Shift+Enter
starts a new line; neither acts while an input method is composing. It rests at two lines,
grows with its text up to about half the viewport, then scrolls. The Frame's dashed border turns
ink while focus is inside it, and the invalid color while the Input is `aria-invalid`.

Note says what sending does; Error replaces it after a failure with the shared form-error
treatment. Point the Input's `aria-describedby` at whichever is shown. Dock keeps a composer at
the bottom of its scrolling region with the surface behind it (`canvas` or `panel`) so content
passes beneath it; in a column that fills its region, such as `Shell.Content fill` or
`Shell.InspectorBody`, it sits at the end even under short content.

The mock's `/` and `⊕` hints are left out until commands and attachments exist. The stories
cover the page and thread composers, sending, pending, failure, long text, Soot, narrow, RTL,
enlarged text, and a docked composer over scrolling content.
