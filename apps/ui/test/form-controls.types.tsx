import { Checkbox } from "@amends/ui/primitives/checkbox";
import { Switch } from "@amends/ui/primitives/switch";
import { Select } from "@amends/ui/primitives/select";
export function examples() {
  <Checkbox indeterminate name="choices" value="a" />;
  <Switch checked name="notifications" />;
  <Select
    options={[{ value: "a", label: "A" }]}
    value={null}
    onChange={(value) => value?.toUpperCase()}
  />;
  // @ts-expect-error Checkbox has a fixed native type.
  <Checkbox type="radio" />;
  // @ts-expect-error Switch is binary.
  <Switch indeterminate />;
  // @ts-expect-error Switch owns its accessible role.
  <Switch role="checkbox" />;
  // @ts-expect-error Native checked determines the switch state.
  <Switch aria-checked="mixed" />;
  // @ts-expect-error This Select is single-choice.
  <Select options={[]} multiple />;
  // @ts-expect-error Select uses an option model, not native children.
  <Select options={[]}>
    <option>A</option>
  </Select>;
  // @ts-expect-error The ref targets the trigger button, not a native select.
  <Select options={[]} ref={(input: HTMLSelectElement) => input} />;
}
