import { expect, it } from "@effect/vitest";
import { compile, parseDrawing } from "../scripts/compiler.ts";

const source = {
  name: "sample",
  title: "Sample",
  categories: ["actions"],
  keywords: ["example"],
  shapes: [{ line: [4, 6, 20, 6] }],
};

it.each([
  [{ line: [4.2, 6, 20, 6] }, /half grid/],
  [{ line: [1, 6, 20, 6] }, /safe area/],
  [{ line: [4, 6, 4, 6] }, /zero-length/],
  [{ line: [4, 6, Number.NaN, 6] }, /finite/],
  [{ line: [4, 6, 20, 6], circle: [12, 12, 4] }, /unsupported field/],
  [{ rect: [4, 4, 6, 8], radius: 4 }, /radius/],
  [{ circle: [12, 12, 11] }, /safe area/],
  [{ arc: [12, 21, 7, 0, 180] }, /safe area/],
  [{ arc: [12, 12, 7, 10, 90] }, /multiples of 45/],
  [{ arc: [12, 12, 7, 0, 360] }, /less than 360/],
  [
    {
      polyline: [
        [4, 4],
        [4, 4],
        [10, 10],
      ],
    },
    /zero-length/,
  ],
  [{ use: "sample", mirror: "x" }, /unsupported field mirror/],
  [{ path: "M4 6h16" }, /unknown primitive/],
] as const)("rejects invalid or unsupported construction %j", (shape, error) => {
  expect(() => parseDrawing({ ...source, shapes: [shape] }, "sample.icon.json")).toThrow(error);
});

it("rejects repeated closing points instead of generating a degenerate corner", () => {
  expect(() =>
    parseDrawing(
      {
        ...source,
        shapes: [
          {
            polyline: [
              [4, 4],
              [20, 4],
              [20, 20],
              [4, 4],
              [4, 4],
            ],
            close: true,
          },
        ],
      },
      "sample.icon.json",
    ),
  ).toThrow(/zero-length closing segment/);
});

it("checks metadata and filenames before generating output", () => {
  expect(() => parseDrawing(source, "wrong.icon.json")).toThrow(/filename/);
  expect(() => parseDrawing({ ...source, categories: ["unknown"] }, "sample.icon.json")).toThrow(
    /category/,
  );
  expect(() => parseDrawing({ ...source, keywords: [] }, "sample.icon.json")).toThrow(
    /string list/,
  );
  expect(() => parseDrawing({ ...source, shapes: [] }, "sample.icon.json")).toThrow(/nonempty/);
});

it("resolves reusable frames and retains the upstream rounded check geometry", () => {
  const frame = parseDrawing({ ...source, shapes: [{ circle: [12, 12, 9] }] }, "sample.icon.json");
  const check = parseDrawing(
    {
      ...source,
      name: "check",
      shapes: [
        {
          polyline: [
            [4, 12],
            [9, 17],
            [20, 6],
          ],
        },
      ],
    },
    "check.icon.json",
  );
  const badge = parseDrawing(
    { ...source, name: "badge", shapes: [{ use: "sample" }, { use: "check" }] },
    "badge.icon.json",
  );
  const icons = compile([frame, check, badge]);
  expect(icons.map((i) => i.name)).toEqual(["badge", "check", "sample"]);
  expect(icons[1]?.path).toBe("M4 12L7.59 15.59A2 2 0 0 0 10.41 15.59L20 6");
  expect(icons[0]?.path).toBe(`${icons[2]?.path}${icons[1]?.path}`);
});

it("rejects reference cycles, missing references, duplicate names, and crowded reused strokes", () => {
  const base = parseDrawing(source, "sample.icon.json");
  const cycle = parseDrawing({ ...source, shapes: [{ use: "sample" }] }, "sample.icon.json");
  const missing = parseDrawing({ ...source, shapes: [{ use: "missing" }] }, "sample.icon.json");
  expect(() => compile([cycle])).toThrow(/cycle/);
  expect(() => compile([missing])).toThrow(/unknown reference/);
  expect(() => compile([base, base])).toThrow(/duplicate/);
  const crowded = parseDrawing(
    { ...source, name: "crowded", shapes: [{ use: "sample" }, { line: [4, 8, 20, 8] }] },
    "crowded.icon.json",
  );
  expect(() => compile([base, crowded])).toThrow(/3 units/);
});

it("checks the closing edge of closed polygons for parallel gaps", () => {
  const drawing = parseDrawing(
    {
      ...source,
      shapes: [
        {
          polyline: [
            [4, 4],
            [20, 4],
            [20, 20],
            [4, 20],
          ],
          close: true,
        },
        { line: [6, 8, 6, 16] },
      ],
    },
    "sample.icon.json",
  );
  expect(() => compile([drawing])).toThrow(/parallel/);
});

it("fills a drawing only when asked, with a boolean", () => {
  expect(parseDrawing(source, "sample.icon.json").fill).toBe(false);
  expect(parseDrawing({ ...source, fill: true }, "sample.icon.json").fill).toBe(true);
  expect(() => parseDrawing({ ...source, fill: "yes" }, "sample.icon.json")).toThrow(
    /fill must be boolean/,
  );
  const [compiled] = compile([parseDrawing({ ...source, fill: true }, "sample.icon.json")]);
  expect(compiled).toMatchObject({ fill: true, path: "M4 6L20 6" });
});
