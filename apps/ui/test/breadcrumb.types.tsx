import { Breadcrumb } from "@amends/ui/compositions/breadcrumb";

export function examples() {
  <Breadcrumb.Root aria-label="Page location">
    <Breadcrumb.Link
      href="/tasks"
      ref={(element) => {
        const anchor: HTMLAnchorElement = element;
        return anchor;
      }}
    >
      Tasks
    </Breadcrumb.Link>
    <Breadcrumb.Current
      ref={(element) => {
        const span: HTMLSpanElement = element;
        return span;
      }}
    >
      this task
    </Breadcrumb.Current>
  </Breadcrumb.Root>;
  // @ts-expect-error Ancestor links require a real destination.
  <Breadcrumb.Link>Tasks</Breadcrumb.Link>;
  // @ts-expect-error The current page has fixed aria-current semantics.
  <Breadcrumb.Current aria-current="step">this task</Breadcrumb.Current>;
  // @ts-expect-error Ancestor links cannot claim to be the current page.
  <Breadcrumb.Link href="/tasks" aria-current="page">
    Tasks
  </Breadcrumb.Link>;
}
