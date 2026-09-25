import { createContext, splitProps, useContext, type JSX } from "solid-js";
import { Text, type TextProps } from "../../primitives/text/index.ts";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./notice.css.ts";

/** Status roles with a soft tint. Notice is the only component allowed a soft status fill. */
export type NoticeTone = "danger" | "pending" | "success";
const Context = createContext<() => NoticeTone>();
function tone() {
  const value = useContext(Context);
  if (!value) throw new Error("Notice parts require Notice.Root");
  return value();
}

export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & { tone: NoticeTone };
/**
 * A soft status panel: a short Label naming the state, then Body text explaining it. Root adds
 * no role or live region; a caller announcing a change opts in with native attributes.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["tone", "class", "classList"]);
  return (
    <Context.Provider value={() => local.tone}>
      <div
        {...native}
        data-notice-tone={local.tone}
        class={classes(`${s.root} ${s.tones[local.tone]}`, local.class, local.classList)}
      />
    </Context.Provider>
  );
}
export type PartProps = Omit<TextProps<"p">, "as" | "variant" | "tone">;
/** The state in a few words, set in the tone's text color. */
export function Label(props: PartProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Text
      {...native}
      as="p"
      variant="mono"
      tone={tone()}
      class={classes(s.label, local.class, local.classList)}
    />
  );
}
/** What happened and what it means, in primary body text. */
export function Body(props: PartProps) {
  tone();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <Text {...native} as="p" class={classes(s.body, local.class, local.classList)} />;
}
