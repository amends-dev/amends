import { Avatar } from "@amends/frontend/primitives/avatar";
import { Status } from "@amends/frontend/primitives/status";

export function examples() {
  <Avatar.Root
    kind="agent"
    aria-label="Ada, agent"
    ref={(node) => {
      const span: HTMLSpanElement = node;
      return span;
    }}
  >
    <Avatar.Fallback>a</Avatar.Fallback>
  </Avatar.Root>;
  <Avatar.Root kind="human" decorative>
    <Avatar.Fallback>JM</Avatar.Fallback>
  </Avatar.Root>;
  <Avatar.Root kind="contact" aria-labelledby="contact-name">
    <Avatar.Fallback>RK</Avatar.Fallback>
  </Avatar.Root>;
  // @ts-expect-error A standalone avatar needs an accessible name.
  <Avatar.Root kind="agent">
    <Avatar.Fallback>a</Avatar.Fallback>
  </Avatar.Root>;
  // @ts-expect-error Decorative avatars do not supply a duplicate accessible label.
  <Avatar.Root kind="agent" decorative aria-label="Ada" />;
  // @ts-expect-error Actions belong to a containing button/link, not the avatar's tab order.
  <Avatar.Root kind="human" aria-label="Jo Mercer" tabIndex={0} />;
  // @ts-expect-error Fallback content is initials or a text glyph, not an interactive element.
  <Avatar.Fallback children={<button>Open</button>} />;
  <Status.Root tone="pending">
    <Status.Indicator />
    <Status.Label>Review</Status.Label>
  </Status.Root>;
  // @ts-expect-error Domain states must be mapped to a semantic tone by the consuming feature.
  <Status.Root tone="failed" />;
  // @ts-expect-error The visible status label is text.
  <Status.Label children={<button>Retry</button>} />;
  // @ts-expect-error The indicator is decorative and cannot become a tab stop.
  <Status.Indicator tabIndex={0} />;
}
