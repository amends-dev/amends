import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import {
  Container,
  Column,
  Grid,
  GridItem,
  Row,
  type GridColumns,
} from "@amends/ui/primitives/layout";
import { Input } from "@amends/ui/primitives/input";

afterEach(cleanup);
it("composes semantic elements and preserves native form/ref/events", () => {
  const submitted = vi.fn();
  let ref: HTMLFormElement | undefined;
  render(() => (
    <Container as="main">
      <Column
        as="form"
        aria-label="Contact"
        ref={(element) => {
          ref = element;
        }}
        onSubmit={(event) => {
          event.preventDefault();
          submitted(new FormData(event.currentTarget).get("name"));
        }}
      >
        <Grid>
          <Input aria-label="Name" name="name" value="Ada" />
          <GridItem span="full">
            <Row>
              <button type="submit">Save</button>
            </Row>
          </GridItem>
        </Grid>
      </Column>
    </Container>
  ));
  const form = screen.getByRole("form", { name: "Contact" });
  expect(ref).toBe(form);
  expect(form.closest("main")).not.toBeNull();
  fireEvent.submit(form);
  expect(submitted).toHaveBeenCalledExactlyOnceWith("Ada");
});
it("changes layout configuration without replacing or blurring entered content", () => {
  const [columns, setColumns] = createSignal<GridColumns>(3),
    [full, setFull] = createSignal(false);
  render(() => (
    <Grid maxColumns={columns()} gap={4}>
      <GridItem span={full() ? "full" : "auto"}>
        <Input aria-label="Name" value="Ada" />
      </GridItem>
    </Grid>
  ));
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.input(input, { target: { value: "Grace" } });
  input.focus();
  input.setSelectionRange(1, 3);
  setColumns(1);
  setFull(true);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue("Grace");
  expect(input.selectionStart).toBe(1);
  expect(input.selectionEnd).toBe(3);
});
it("keeps native list structure and consumer attributes without inserting item wrappers", () => {
  render(() => (
    <Grid
      as="ul"
      aria-label="Choices"
      class="consumer"
      classList={{ custom: true }}
      style={{ color: "red" }}
    >
      <GridItem as="li">One</GridItem>
      <li>Two</li>
    </Grid>
  ));
  const list = screen.getByRole("list", { name: "Choices" });
  expect(list.children).toHaveLength(2);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(list).toHaveClass("consumer", "custom");
  expect(list).toHaveStyle({ color: "red" });
  for (const attribute of ["as", "gap", "maxcolumns", "mincolumnwidth", "layoutclass", "variables"])
    expect(list).not.toHaveAttribute(attribute);
});
