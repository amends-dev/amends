import { createSignal, Show, untrack, type JSX } from "solid-js";
import { Disclosure } from "./disclosure.tsx";
import { StatusIndicator, type StatusTone } from "./status-indicator.tsx";
import { Text } from "./text.tsx";
import { Identity, type IdentityData } from "./identity.tsx";

export interface TurnSummaryData {
  label: string;
  status: string;
  tone: StatusTone;
  author: string;
  authorKind?: IdentityData["kind"];
  time: string;
  duration?: string;
  note?: string;
}

/** Execution details mount only while expanded; messages belong in the surrounding conversation. */
export function TurnSummary(props: TurnSummaryData & { children: () => JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  return (
    <Disclosure
      label={props.label}
      divided={false}
      status={props.status}
      indicator={<StatusIndicator tone={props.tone} decorative />}
      metadata={
        <>
          <Identity name={props.author} kind={props.authorKind ?? "agent"} size="compact" /> ·{" "}
          {[props.time, props.duration].filter(Boolean).join(" · ")}
        </>
      }
      expanded={open()}
      onExpandedChange={setOpen}
    >
      <Show when={open()}>
        <Show when={props.note}>
          <Text>{props.note}</Text>
        </Show>
        {untrack(props.children)}
      </Show>
    </Disclosure>
  );
}
