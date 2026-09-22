# Breadcrumb

`Breadcrumb` is the compact page-location trail shown above the title in the screen mocks.
Declare ancestor destinations in order and finish with the current page:

```tsx
import { Breadcrumb } from "@amends/frontend/compositions/breadcrumb";

<Breadcrumb.Root>
  <Breadcrumb.Link href="/tasks">Tasks</Breadcrumb.Link>
  <Breadcrumb.Link href="/tasks/september-close">September close</Breadcrumb.Link>
  <Breadcrumb.Current>this task</Breadcrumb.Current>
</Breadcrumb.Root>;
```

Root renders a `nav` named “Breadcrumb” containing an ordered list. Link is a native anchor;
the caller supplies its `href` and router behavior. Current is visible, noninteractive text
with `aria-current="page"`. Decorative slash separators are hidden from assistive technology.
The root can take another `aria-label` or `aria-labelledby` when a page needs one. Keep one
Current at the end of a trail. A root page may use Current alone; the Home and Tasks screen
mocks omit a separate trail, so the page decides whether to render one.

The component owns no outer spacing or title. A page header places it above the heading and
can put a mobile menu control beside it. Labels wrap on narrow screens instead of being
silently shortened, including long task or resource names. Ancestors use `text.secondary`
rather than the mock's slightly lighter gray to preserve the existing reviewed reading
contrast; the underline uses `line.seam`. Hover and keyboard focus use the existing color
and focus foundations. The Storybook Reference recreates the task-detail header; Comparison
shows one through four levels in Cotton and Soot, and Narrow and Right To Left cover layout.
