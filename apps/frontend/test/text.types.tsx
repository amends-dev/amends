import { Text } from "@amends/frontend/primitives/text";

// Checked by TypeScript, not rendered by the test runner.
export function textTypeExamples() {
  <Text
    as="h2"
    ref={(element) => {
      const heading: HTMLHeadingElement = element;
      return heading;
    }}
  />;
  <Text
    ref={(element) => {
      const paragraph: HTMLParagraphElement = element;
      return paragraph;
    }}
  />;
  // @ts-expect-error Text does not introduce anchor behavior.
  <Text as="a" href="/" />;
  // @ts-expect-error Native paragraph attributes do not include href.
  <Text href="/" />;
  // @ts-expect-error Only reviewed typography variants are supported.
  <Text variant="display" />;
  <Text tone="danger">Error: could not save.</Text>;
  <Text tone="success" role="status">
    Saved.
  </Text>;
  <Text tone="warning">Warning: review access.</Text>;
  <Text tone="pending">Pending: awaiting approval.</Text>;
  // @ts-expect-error Raw color names are not semantic tones.
  <Text tone="red" />;
  // @ts-expect-error The default element is not an SVG element.
  <Text ref={(element: SVGElement) => element} />;
}
