/** A native link when a destination is supplied, or a Block action in a standalone composition. */

import * as Button from "@foldkit/ui/button"
import type { Attribute, Html, HtmlBuilder } from "foldkit/html"

export const navigationTarget = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  target: Readonly<{ onClick?: Message | undefined; href?: string | undefined }>,
  attributes: ReadonlyArray<Attribute<Message, Requirements>>,
  children: ReadonlyArray<Html | string>
): Html =>
  target.href === undefined
    ? target.onClick === undefined
      ? h.span(attributes, children)
      : Button.view(
          { onClick: target.onClick, toView: (behavior) => h.button([...behavior.button, ...attributes], children) },
          h
        )
    : h.a([h.Href(target.href), ...attributes], children)
