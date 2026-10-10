import { For, splitProps, type JSX } from "solid-js";
import { Theme } from "../foundations/theme/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./code-window.css.ts";

export type CodeWindowProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children" | "title"> & {
  /** The file or tool it shows, such as "review.ts" or "Terminal". */
  title: string;
  /** Shown as written, in the code face. */
  code: string;
};

/** Code or a terminal session in a window, dark in both modes. */
export function CodeWindow(props: CodeWindowProps) {
  const [local, native] = splitProps(props, ["title", "code", "class"]);
  return (
    <Theme mode="dark" class={classes(s.window, local.class)}>
      <figure {...native} class={s.figure}>
        <div class={s.bar}>
          <span class={s.dots} aria-hidden="true">
            <For each={[0, 1, 2]}>{() => <span class={s.dot} />}</For>
          </span>
          <figcaption class={s.title}>{local.title}</figcaption>
        </div>
        <pre class={s.code}>
          <code>{local.code}</code>
        </pre>
      </figure>
    </Theme>
  );
}
