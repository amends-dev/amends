import { For, splitProps, type JSX } from "solid-js"
import { classes } from "../internal/props.ts"
import * as s from "./package-diagram.css.ts"

export interface DiagramContract {
  /** The contract's package, such as "@amends-dev/harness". */
  readonly name: string
  /** The packages that implement it, such as "harness-amends". */
  readonly adapters: ReadonlyArray<string>
}

export type PackageDiagramProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children"> & {
  /** What depends on the contracts, such as "Your Effect program". */
  program: string
  contracts: ReadonlyArray<DiagramContract>
}

/**
 * A program over contracts, each with the adapters that implement it, stitched together. It is
 * nested lists underneath, so assistive technology reads which adapter implements which contract.
 */
export function PackageDiagram(props: PackageDiagramProps) {
  const [local, native] = splitProps(props, ["program", "contracts", "class"])
  return (
    <figure {...native} class={classes(s.diagram, local.class)}>
      <span class={s.program}>{local.program}</span>
      <span class={s.seam} aria-hidden="true" />
      <ul class={s.contracts} aria-label="Contracts">
        <For each={local.contracts}>
          {(contract) => (
            <li class={s.contract}>
              <span class={s.contractName}>{contract.name}</span>
              <ul class={s.adapters} aria-label={`Implementations of ${contract.name}`}>
                <For each={contract.adapters}>{(adapter) => <li class={s.adapter}>{adapter}</li>}</For>
              </ul>
            </li>
          )}
        </For>
      </ul>
      <ul class={s.legend} aria-hidden="true">
        <li class={s.key}>
          <span class={classes(s.swatch, s.swatchContract)} />
          Contract
        </li>
        <li class={s.key}>
          <span class={classes(s.swatch, s.swatchAdapter)} />
          Adapter
        </li>
      </ul>
    </figure>
  )
}
