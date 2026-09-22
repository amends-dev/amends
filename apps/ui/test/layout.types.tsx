import { Container, Row, Column, Grid, GridItem } from "@amends/ui/primitives/layout";
export function examples() {
  <Container as="main" gutter={4} maxWidth="67.5rem" />;
  <Column
    as="form"
    method="post"
    onSubmit={(event) => event.currentTarget.requestSubmit()}
    ref={(element) => {
      const form: HTMLFormElement = element;
      return form;
    }}
  />;
  <Row as="nav" aria-label="Actions" align="center" justify="between" wrap={false} />;
  <Grid as="ul" gap={3} maxColumns={3} minColumnWidth="14rem">
    <GridItem as="li" span="full">
      Full row
    </GridItem>
  </Grid>;
  // @ts-expect-error A div is not a form.
  <Column method="post" />;
  // @ts-expect-error Gaps use reviewed spacing steps.
  <Row gap={12} />;
  // @ts-expect-error Track widths must be explicit lengths.
  <Grid minColumnWidth="auto" />;
  // @ts-expect-error Column limits are positive counts.
  <Grid maxColumns={0} />;
  // @ts-expect-error Numeric spans across changing auto-fit tracks are not part of this API.
  <GridItem span={2} />;
  // @ts-expect-error The native ref type follows the semantic element.
  <Container as="form" ref={(element: HTMLInputElement) => element} />;
}
