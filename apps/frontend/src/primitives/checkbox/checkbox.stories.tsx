import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Checkbox, type CheckboxProps } from "@amends/frontend/primitives/checkbox";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import {
  ToggleComparison,
  TogglePlayground,
  ToggleInteraction,
  ToggleForms,
  ToggleLongLabels,
  verifyToggle,
  toggleInteractionPlay,
  toggleFormPlay,
} from "../control/toggle.stories-support.tsx";
type Args = CheckboxProps & { theme: ColorTheme; label: string };
const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  render: (props: Args) => <TogglePlayground {...props} kind="checkbox" />,
  args: {
    theme: "cotton",
    label: "Notifications",
    checked: false,
    disabled: false,
    indeterminate: false,
  },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    label: { control: "text" },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    indeterminate: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" as const },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => <ToggleComparison kind="checkbox" />,
  parameters: { controls: { disable: true } },
  play: verifyToggle("checkbox"),
} satisfies Story;
export const Playground = {} satisfies Story;
export const Interaction = {
  render: () => <ToggleInteraction kind="checkbox" />,
  parameters: { controls: { disable: true } },
  play: toggleInteractionPlay("checkbox"),
} satisfies Story;
export const Forms = {
  render: () => <ToggleForms kind="checkbox" />,
  parameters: { controls: { disable: true } },
  play: toggleFormPlay("checkbox"),
} satisfies Story;
export const LongLabels = {
  render: () => <ToggleLongLabels kind="checkbox" />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <ToggleLongLabels kind="checkbox" enlarged />,
  parameters: { controls: { disable: true } },
  tags: ["!autodocs"],
} satisfies Story;
