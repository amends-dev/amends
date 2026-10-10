import { IconCheck, type IconName } from "@amends-dev/icons";
import { IconMenu } from "@amends-dev/icons/menu";

export function iconTypeExamples() {
  <IconCheck size="md" weight={1.75} label="Completed" />;
  <IconMenu size={24} class="menu" ref={(element: SVGSVGElement) => element} />;
  const name: IconName = "circle-check";
  // @ts-expect-error Unknown names are excluded from the generated name union.
  const missing: IconName = "missing-icon";
  // @ts-expect-error Use the controlled size API.
  <IconCheck width={40} />;
  // @ts-expect-error Unsupported sizes are rejected.
  <IconCheck size="large" />;
  // @ts-expect-error Stroke weights follow the drawing contract.
  <IconCheck weight={3} />;
  // @ts-expect-error Named icons own their geometry.
  <IconCheck>
    <path d="M0 0" />
  </IconCheck>;
  // @ts-expect-error Use label instead of assigning an interactive role.
  <IconCheck role="button" />;
  // @ts-expect-error Icons do not introduce focus stops.
  <IconCheck tabIndex={0} />;
  // @ts-expect-error Ref receives an SVG element.
  <IconCheck ref={(element: HTMLButtonElement) => element} />;
  return [name, missing];
}
