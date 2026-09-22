import { Button } from "@amends/frontend/primitives/button";

// Type-checked examples; not rendered by the test runner.
export function buttonTypeExamples() {
  <Button variant="ghost">Change email</Button>;
  <Button variant="secondary" tone="danger">
    Delete thread
  </Button>;
  // @ts-expect-error Status feedback is not an action tone.
  <Button tone="success">Save</Button>;
  <Button variant="secondary" type="submit">
    Save draft
  </Button>;
  <Button
    type="submit"
    name="intent"
    value="publish"
    form="composer"
    disabled
    ref={(element) => {
      const button: HTMLButtonElement = element;
      return button;
    }}
  />;
  // @ts-expect-error This primitive always renders a button.
  <Button as="a" />;
  // @ts-expect-error Native buttons do not have href.
  <Button href="/" />;
  // @ts-expect-error Only native button types are supported.
  <Button type="primary" />;
  // @ts-expect-error Additional visual variants are not part of this slice.
  <Button variant="outline" />;
  <Button pending>Publish reply</Button>;
  // @ts-expect-error Pending is a boolean controlled by the caller.
  <Button pending="true" />;
  // @ts-expect-error The ref receives a button, not an anchor.
  <Button ref={(element: HTMLAnchorElement) => element} />;
}
