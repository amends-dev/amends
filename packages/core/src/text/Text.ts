/**
 * What text people enter must be for storage to keep it as given and for a name to read as one:
 * the filters every schema of free text or of a name applies, and how long a name may be.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Text storage keeps as given: no NUL, which PostgreSQL text cannot hold, and no unpaired
 * surrogate half, which UTF-8 cannot encode and would be replaced.
 *
 * @category utils
 * @since 0.1.0
 */
export const isStorable = Schema.makeFilter(
  (text: string) =>
    (!text.includes("\u0000") && !/\p{Cs}/u.test(text)) ||
    "Expected text without NUL characters or unpaired surrogates",
);

// Controls, unpaired surrogates, direction embeddings, overrides, and isolates, and invisible
// spaces: each can make one name read as another. Joiners stay, since emoji and scripts need them.
const hidden = /[\p{Cc}\p{Cs}​‪-‮⁦-⁩﻿]/u;

/**
 * A name people read and choose between: without control, direction, or invisible characters.
 *
 * @category utils
 * @since 0.1.0
 */
export const isName = Schema.makeFilter(
  (text: string) =>
    !hidden.test(text) || "Expected a name without control, direction, or invisible characters",
);

/**
 * The most characters a name may have, as people choose one.
 *
 * @category utils
 * @since 0.1.0
 */
export const nameLength = 80;
