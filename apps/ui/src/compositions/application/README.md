# Application presentation

`ApplicationFrame` and `ApplicationPage` provide the existing minimal application
presentation without client state, API types, routing, or business behavior.

```tsx
import { ApplicationFrame, ApplicationPage } from "@amends/ui/compositions/application";
import { Button } from "@amends/ui/primitives/button";

<ApplicationFrame theme="cotton">
  <ApplicationPage brand="Amends" title="Welcome" message="Choose what to do next.">
    <Button onClick={continueFlow}>Continue</Button>
  </ApplicationPage>
</ApplicationFrame>;
```

Frame supplies a full-viewport Cotton or Soot surface and the shared font family.
Page supplies a constrained main region, optional brand text, title, message, and
caller-owned children. Its spacing and typography match the earlier application
placeholder presentation. The consumer owns all copy, controls, navigation, error
handling, and loading announcements. Load the fonts explicitly at the entry point.

`@amends/ui/styles` is an opt-in app document reset for `html`, `body`, and `#root`.
It is imported by web and desktop, not automatically by components or Storybook.

**Compositions / Application** covers Cotton, Soot, long content, and caller-owned
action recovery. The recovery story also runs as a portable test. App-specific routes
and session interactions are verified in the web and desktop suites.
