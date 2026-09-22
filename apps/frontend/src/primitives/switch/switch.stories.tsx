import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Switch, type SwitchProps } from "@amends/frontend/primitives/switch";
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
type Args = SwitchProps & { theme: ColorTheme; label: string };
const meta = {
  title: "Primitives/Switch",
  component: Switch,
  render: (props: Args) => <TogglePlayground {...props} kind="switch" />,
  args: { theme: "cotton", label: "Notifications", checked: false, disabled: false },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    label: { control: "text" },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" as const },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => <ToggleComparison kind="switch" />,
  parameters: { controls: { disable: true } },
  play: verifyToggle("switch"),
} satisfies Story;
export const Playground = {} satisfies Story;
export const Interaction = {
  render: () => <ToggleInteraction kind="switch" />,
  parameters: { controls: { disable: true } },
  play: toggleInteractionPlay("switch"),
} satisfies Story;
export const Forms = {
  render: () => <ToggleForms kind="switch" />,
  parameters: { controls: { disable: true } },
  play: toggleFormPlay("switch"),
} satisfies Story;
export const LongLabels = {
  render: () => <ToggleLongLabels kind="switch" />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <ToggleLongLabels kind="switch" enlarged />,
  parameters: { controls: { disable: true } },
  tags: ["!autodocs"],
} satisfies Story;

export const RightToLeft = {
  ...Comparison,
  render: () => <ToggleComparison kind="switch" rtl />,
} satisfies Story;
