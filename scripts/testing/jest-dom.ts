import { expect } from "@effect/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import type {} from "@testing-library/jest-dom/vitest";

// Explicit setup prevents vite-plugin-solid's optional dependency discovery from
// changing test configuration when another workspace installs Storybook.
expect.extend(matchers);
