// Geometry and rounded-corner construction for the package's drawings.
// This deliberately supports only the primitives needed by the current drawings.
export const spec = {
  canvas: 24,
  safe: [2, 22],
  stroke: 2,
  corner: 2,
  minGap: 3,
  categories: ["navigation", "actions", "status", "content", "agent", "controls", "shapes"],
} as const;

type Point = [number, number];
type Shape =
  | { line: [number, number, number, number] }
  | { polyline: Array<Point>; close: boolean; corner: number }
  | { rect: [number, number, number, number]; radius: number }
  | { circle: [number, number, number] }
  | { arc: [number, number, number, number, number] }
  | { dot: Point }
  | { use: string };
export interface Drawing {
  name: string;
  title: string;
  categories: Array<string>;
  keywords: Array<string>;
  /** Paint the enclosed areas as well as the strokes, for an active state such as a set bell. */
  fill: boolean;
  shapes: Array<Shape>;
}
export interface CompiledIcon extends Drawing {
  path: string;
  exportName: string;
}

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}
function object(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(context, "expected an object");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: ReadonlyArray<string>, context: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(context, `unsupported field ${key}`);
}
function numbers<T extends Array<number>>(value: unknown, length: T["length"], context: string): T {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    fail(context, `expected ${length} finite numbers`);
  }
  return value as T;
}
function strings(value: unknown, context: string): Array<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((s) => typeof s === "string" && s.trim())
  )
    fail(context, "expected a nonempty string list");
  return value as Array<string>;
}
function number(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(context, "expected a finite number");
  return value;
}
function point(p: Point, context: string) {
  for (const n of p) {
    if (!Number.isInteger(n * 2)) fail(context, "coordinates must be on the half grid");
    if (n < spec.safe[0] || n > spec.safe[1])
      fail(context, "coordinates must stay in the safe area (2 to 22)");
  }
}
function positiveRadius(value: number, context: string) {
  if (value <= 0 || !Number.isInteger(value * 2))
    fail(context, "radius must be positive and on the half grid");
}
function parseShape(input: unknown, context: string): Shape {
  const s = object(input, context);
  if ("use" in s) {
    keys(s, ["use"], context);
    if (typeof s.use !== "string" || !s.use) fail(context, "use requires an icon name");
    return { use: s.use };
  }
  if ("line" in s) {
    keys(s, ["line"], context);
    const line = numbers<[number, number, number, number]>(s.line, 4, context);
    const [x1, y1, x2, y2] = line;
    point([x1, y1], context);
    point([x2, y2], context);
    if (x1 === x2 && y1 === y2) fail(context, "zero-length line");
    return { line };
  }
  if ("polyline" in s) {
    keys(s, ["polyline", "close", "corner"], context);
    if (s.close !== undefined && typeof s.close !== "boolean")
      fail(context, "close must be boolean");
    if (!Array.isArray(s.polyline)) fail(context, "polyline must be a point list");
    const points = s.polyline.map((p) => numbers<Point>(p, 2, context));
    const close = s.close ?? false;
    const first = points[0],
      last = points.at(-1);
    if (close && first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
    if (points.length < (close ? 3 : 2)) fail(context, "not enough polyline points");
    const closingPoint = points.at(-1)!;
    if (close && first && first[0] === closingPoint[0] && first[1] === closingPoint[1]) {
      fail(context, "zero-length closing segment");
    }
    points.forEach((p, i) => {
      point(p, context);
      const previous = points[i - 1];
      if (previous && p[0] === previous[0] && p[1] === previous[1])
        fail(context, "zero-length polyline segment");
    });
    const corner = number(s.corner ?? spec.corner, context);
    if (corner < 0 || corner > 4 || !Number.isInteger(corner * 2))
      fail(context, "corner must be 0 to 4 on the half grid");
    return { polyline: points, close, corner };
  }
  if ("rect" in s) {
    keys(s, ["rect", "radius"], context);
    const rect = numbers<[number, number, number, number]>(s.rect, 4, context);
    const [x, y, w, h] = rect;
    if (w <= 0 || h <= 0) fail(context, "rectangle dimensions must be positive");
    point([x, y], context);
    point([x + w, y + h], context);
    const radius = number(s.radius ?? (Math.min(w, h) < 8 ? 1 : 2), context);
    if (radius < 0 || radius > Math.min(w, h) / 2 || !Number.isInteger(radius * 2))
      fail(context, "invalid rectangle radius");
    return { rect, radius };
  }
  if ("circle" in s || "arc" in s) {
    const kind = "circle" in s ? "circle" : "arc";
    keys(s, [kind], context);
    const values =
      kind === "circle"
        ? numbers<[number, number, number]>(s.circle, 3, context)
        : numbers<[number, number, number, number, number]>(s.arc, 5, context);
    const [cx, cy, r] = values;
    point([cx, cy], context);
    positiveRadius(r, context);
    if (kind === "circle") {
      point([cx - r, cy - r], context);
      point([cx + r, cy + r], context);
      return { circle: [cx, cy, r] };
    }
    const from = values[3]!,
      to = values[4]!;
    if (from % 45 || to % 45 || from === to || Math.abs(to - from) >= 360)
      fail(context, "arc angles must be distinct multiples of 45 spanning less than 360 degrees");
    const sweep = (((to - from) % 360) + 360) % 360;
    const angles = [
      from,
      to,
      ...[0, 90, 180, 270].filter((a) => (((a - from) % 360) + 360) % 360 <= sweep),
    ];
    for (const a of angles) {
      const p = polar(cx, cy, r, a);
      if (p.some((n) => n < 2 - 1e-9 || n > 22 + 1e-9)) fail(context, "arc leaves the safe area");
    }
    return { arc: [cx, cy, r, from, to] };
  }
  if ("dot" in s) {
    keys(s, ["dot"], context);
    const dot = numbers<Point>(s.dot, 2, context);
    point(dot, context);
    return { dot };
  }
  return fail(context, "unknown primitive");
}

export function parseDrawing(input: unknown, file: string): Drawing {
  const d = object(input, file);
  keys(d, ["name", "title", "categories", "keywords", "fill", "shapes"], file);
  if (typeof d.name !== "string" || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(d.name))
    fail(file, "name must be kebab-case");
  if (file !== `${d.name}.icon.json`) fail(file, "filename must match the icon name");
  if (typeof d.title !== "string" || !d.title.trim()) fail(file, "title is required");
  const categories = strings(d.categories, file);
  for (const category of categories)
    if (!(spec.categories as ReadonlyArray<string>).includes(category))
      fail(file, `unknown category ${category}`);
  if (!Array.isArray(d.shapes) || !d.shapes.length) fail(file, "shapes must be a nonempty list");
  if (d.fill !== undefined && typeof d.fill !== "boolean") fail(file, "fill must be boolean");
  return {
    name: d.name,
    title: d.title,
    categories,
    keywords: strings(d.keywords, file),
    fill: d.fill ?? false,
    shapes: d.shapes.map((s, index) => parseShape(s, `${file}: shape ${index}`)),
  };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString().replace(/^(-?)0\./, "$1.");
const pair = (p: Point) => p.map(fmt).join(" ");
function polar(cx: number, cy: number, r: number, angle: number): Point {
  return [cx + r * Math.cos((angle * Math.PI) / 180), cy + r * Math.sin((angle * Math.PI) / 180)];
}
function roundedCorner(a: Point, v: Point, b: Point, radius: number) {
  const ax = a[0] - v[0],
    ay = a[1] - v[1],
    bx = b[0] - v[0],
    by = b[1] - v[1];
  const la = Math.hypot(ax, ay),
    lb = Math.hypot(bx, by);
  const theta = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
  if (!radius || theta > Math.PI - 1e-6 || theta < 1e-6) return null;
  const t = Math.min(radius / Math.tan(theta / 2), Math.min(la, lb) * 0.4);
  const r = t * Math.tan(theta / 2);
  const p1: Point = [v[0] + (ax / la) * t, v[1] + (ay / la) * t];
  const p2: Point = [v[0] + (bx / lb) * t, v[1] + (by / lb) * t];
  return { p1, p2, r, sweep: ax * by - ay * bx < 0 ? 1 : 0 };
}
function polylinePath(points: Array<Point>, close: boolean, corner: number): string {
  const n = points.length;
  const corners = points.map((p, i) =>
    !close && (i === 0 || i === n - 1)
      ? null
      : roundedCorner(points[(i - 1 + n) % n]!, p, points[(i + 1) % n]!, corner),
  );
  const segment = (index: number) => {
    const c = corners[index];
    return c
      ? `L${pair(c.p1)}A${fmt(c.r)} ${fmt(c.r)} 0 0 ${c.sweep} ${pair(c.p2)}`
      : `L${pair(points[index]!)}`;
  };
  let path = `M${pair(close && corners[0] ? corners[0].p2 : points[0]!)}`;
  for (let i = 1; i < n; i++) path += segment(i);
  return close ? `${path}${segment(0)}Z` : path;
}
type Primitive = Exclude<Shape, { use: string }>;
function toPath(s: Primitive): string {
  if ("line" in s) {
    const [x1, y1, x2, y2] = s.line;
    return `M${pair([x1, y1])}L${pair([x2, y2])}`;
  }
  if ("polyline" in s) return polylinePath(s.polyline, s.close, s.corner);
  if ("dot" in s) return `M${pair(s.dot)}v.01`;
  if ("circle" in s) {
    const [cx, cy, r] = s.circle;
    return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`;
  }
  if ("arc" in s) {
    const [cx, cy, r, from, to] = s.arc;
    const sweep = (((to - from) % 360) + 360) % 360;
    return `M${pair(polar(cx, cy, r, from))}A${fmt(r)} ${fmt(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${pair(polar(cx, cy, r, to))}`;
  }
  const [x, y, w, h] = s.rect,
    r = s.radius;
  if (!r) return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
  const arc = (endX: number, endY: number) =>
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(endX)} ${fmt(endY)}`;
  return `M${fmt(x + r)} ${fmt(y)}H${fmt(x + w - r)}${arc(x + w, y + r)}V${fmt(y + h - r)}${arc(x + w - r, y + h)}H${fmt(x + r)}${arc(x, y + h - r)}V${fmt(y + r)}${arc(x + r, y)}Z`;
}
function validateGaps(shapes: Array<Primitive>, name: string) {
  const lines: Array<{ axis: string; at: number; lo: number; hi: number }> = [];
  const segment = ([x1, y1]: Point, [x2, y2]: Point) => {
    if (x1 === x2) lines.push({ axis: "v", at: x1, lo: Math.min(y1, y2), hi: Math.max(y1, y2) });
    if (y1 === y2) lines.push({ axis: "h", at: y1, lo: Math.min(x1, x2), hi: Math.max(x1, x2) });
  };
  for (const shape of shapes) {
    if ("line" in shape) {
      const [x1, y1, x2, y2] = shape.line;
      segment([x1, y1], [x2, y2]);
    } else if ("polyline" in shape) {
      for (let i = 1; i < shape.polyline.length; i++)
        segment(shape.polyline[i - 1]!, shape.polyline[i]!);
      if (shape.close) segment(shape.polyline.at(-1)!, shape.polyline[0]!);
    } else if ("rect" in shape) {
      const [x, y, w, h] = shape.rect;
      segment([x, y], [x + w, y]);
      segment([x, y + h], [x + w, y + h]);
      segment([x, y], [x, y + h]);
      segment([x + w, y], [x + w, y + h]);
    }
  }
  for (const [i, a] of lines.entries())
    for (const b of lines.slice(i + 1)) {
      if (
        a.axis === b.axis &&
        a.at !== b.at &&
        Math.min(a.hi, b.hi) > Math.max(a.lo, b.lo) &&
        Math.abs(a.at - b.at) < spec.minGap
      )
        fail(name, "parallel strokes must be at least 3 units apart");
    }
}

export function compile(drawings: Array<Drawing>): Array<CompiledIcon> {
  const byName = new Map(drawings.map((d) => [d.name, d]));
  if (byName.size !== drawings.length) fail("icons", "duplicate name");
  const resolve = (drawing: Drawing, seen: Array<string>): Array<Primitive> => {
    if (seen.includes(drawing.name)) fail(drawing.name, `reference cycle: ${seen.join(" > ")}`);
    return drawing.shapes.flatMap((s) => {
      if (!("use" in s)) return [s];
      const target = byName.get(s.use);
      if (!target) fail(drawing.name, `unknown reference ${s.use}`);
      return resolve(target, [...seen, drawing.name]);
    });
  };
  return [...drawings]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((drawing) => {
      const shapes = resolve(drawing, []);
      validateGaps(shapes, drawing.name);
      return {
        ...drawing,
        path: shapes.map(toPath).join(""),
        exportName: `Icon${drawing.name.replace(/(^|-)([a-z0-9])/g, (_, _prefix: string, letter: string) => letter.toUpperCase())}`,
      };
    });
}
