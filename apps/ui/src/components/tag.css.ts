import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "inline-flex",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  padding: "1px 5px",
  border: `1px dashed ${vars.color.line.control}`,
  borderRadius: 4,
  fontFamily: vars.font.mono,
  fontSize: "0.625rem",
  lineHeight: 1.4,
  color: vars.color.text.muted,
  textTransform: "uppercase",
  selectors: {
    '&[data-appearance="plain"]': { border: 0, padding: 0 },
    '&[data-tone="success"]': {
      color: vars.color.status.success.text,
      borderColor: vars.color.status.success.text,
    },
    '&[data-appearance="pill"]': {
      padding: "7px 13px",
      borderRadius: 999,
      fontSize: "0.75rem",
      textTransform: "none",
    },
  },
});
