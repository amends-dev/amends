import { CodeInput } from "@amends/ui/primitives/code-input";

export function codeInputTypeExamples() {
  <CodeInput value="012345" required name="code" onInput={(event) => event.currentTarget.value} />;
  <CodeInput ref={(input: HTMLInputElement) => input.select()} />;
  // @ts-expect-error Codes are strings so leading zeros survive.
  <CodeInput value={123456} />;
  // @ts-expect-error The control uses a native text input.
  <CodeInput type="number" />;
  // @ts-expect-error Six digits are the scope of this component.
  <CodeInput maxLength={4} />;
  // @ts-expect-error Native validation requires six ASCII digits.
  <CodeInput pattern=".*" />;
  // @ts-expect-error Presentation slots are decorative, not child controls.
  <CodeInput>123456</CodeInput>;
}
