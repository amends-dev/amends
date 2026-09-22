import { Radio } from "@amends/ui/primitives/radio";
export function radioTypeExamples() {
  <Radio
    name="choice"
    value="a"
    checked
    onChange={(event) => event.currentTarget.checked}
    ref={(element) => {
      const input: HTMLInputElement = element;
      return input;
    }}
  />;
  // @ts-expect-error Radio fixes the native input type.
  <Radio type="checkbox" />;
  // @ts-expect-error Radio is a void native control; the caller supplies a label.
  <Radio children="Label" />;
  // @ts-expect-error This primitive does not compose labels.
  <Radio label="Choice" />;
}
