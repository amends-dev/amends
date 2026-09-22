# Toast

Transient, local UI feedback matching the dark bottom-center toast in Primitives v2.
This is presentation state; it does not acknowledge backend notifications or perform work.

```tsx
import { Toast } from "@amends/ui/compositions/toast";
import { Button } from "@amends/ui/primitives/button";

function AcceptTask() {
  const toast = Toast.useToast();
  return (
    <Button
      onClick={() =>
        toast.show(() => (
          <Toast.Root>
            <Toast.Title>Task accepted.</Toast.Title>
            <Toast.Action
              onClick={() => {
                /* Undo in the consuming feature. */
              }}
            >
              undo
            </Toast.Action>
          </Toast.Root>
        ))
      }
    >
      Accept task
    </Button>
  );
}

<Toast.Provider>
  <AcceptTask />
  <Toast.Viewport />
</Toast.Provider>;
```

Mount exactly one Viewport per Provider in a theme scope. `useToast().show` accepts a
lazy render function containing one Root and returns a provider-local ID. `dismiss(id)`
and `clear()` affect only that provider. The queue is disposed with the provider; there
is no module-global store. The default visible limit is three, configurable with `limit`.
Queued messages start their lifetime when shown. Lowering the limit remounts queued
items when they become visible again, so configure the limit once for each provider.

Compose Title directly for short messages. Use Content around Title and Description
for longer messages; Action and Close sit alongside. Text wraps and the queue scrolls
within the viewport. Close defaults to a named X icon; Action is the amber underlined
native button. Both respect disabled attributes and prevented clicks. Action closes
after activation unless the handler prevents default; asynchronous work remains caller-owned.

Messages without an Action dismiss after five seconds. Action messages persist by
default; `persistent` and `duration` on Root can override the policy. This intentionally
gives the mock's Undo more time than its 3.2-second timeout. Timers pause during hover,
focus, window blur, and document hiding, then resume the remaining lifetime. Use
`persistent` plus Close for information that requires explicit dismissal; essential
information should also remain available in the page.

Each message is a polite, atomic status announcement and does not steal focus on arrival.
Alt+T focuses the first visible message; Tab reaches its actions. Escape dismisses only
the focused toast. Dismissal returns focus to the element active when it was created
if focus was inside that toast. Include the shortcut in help where users can discover it.

Viewport renders in place and inherits theme/direction. Mount it near the app root,
outside transformed or clipping layout ancestors. For feedback while a native Dialog
or Drawer remains open, mount a separate Provider/Viewport **inside that modal**. Global
toasts stay behind native modals; they cannot bypass modal inertness with a z-index.
The Inside Dialog story demonstrates this placement. Position can be overridden with
native `style` for contained workshop specimens.

The toast has its own `toast.surface`, `toast.text`, and `toast.action` color pairings,
shown under Foundations / Color / Toast and contrast-tested independently. Both themes
use the dark reference treatment. Focus is light on that surface; forced colors use
system colors. Motion respects reduced-motion preferences. The reference's 12px corners
and spacing remain component styles rather than additions to the generic radius scale.

Tests cover queue isolation/promotion, timer pausing, action persistence/cancellation,
focus recovery, and provider disposal. Stories cover both themes, long text, actions,
queues, and modal placement. Browser review checks the shortcut, contrast, viewport fit,
forced colors, reduced motion, and native modal interaction. No swipe dismissal,
global event bus, promise adapter, or backend integration is included.
