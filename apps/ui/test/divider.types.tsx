import { Divider } from "@amends/ui/primitives/divider";
import { IconButton } from "@amends/ui/primitives/icon-button";

export function examples() {
  <Divider.Line
    ref={(element) => {
      const span: HTMLSpanElement = element;
      return span;
    }}
  />;
  <Divider.Root>
    <Divider.Label
      as="h2"
      ref={(element) => {
        const heading: HTMLHeadingElement = element;
        return heading;
      }}
    >
      Channels
    </Divider.Label>
    <Divider.Line />
    <IconButton aria-label="Create channel">+</IconButton>
  </Divider.Root>;
  // @ts-expect-error Decorative lines cannot contain accessible content.
  <Divider.Line children={<button>Hidden action</button>} />;
  // @ts-expect-error Decorative lines cannot become tab stops.
  <Divider.Line tabIndex={0} />;
  // @ts-expect-error Labels reuse Text's semantic elements, not interactive links.
  <Divider.Label as="a" href="/">
    Link
  </Divider.Label>;
  // @ts-expect-error Divider content is composed through children.
  <Divider.Root label="Today" />;
  // @ts-expect-error Labels have a consistent style instead of arbitrary typography variants.
  <Divider.Label variant="heading">Title</Divider.Label>;
}
