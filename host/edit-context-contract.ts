/**
 * The edit context crosses from the runtime to the agent as JSON: the app builds
 * it with `@vivariumjs/runtime`, the server hands it to `@vivariumjs/agent`. The
 * two packages do not depend on each other — the agent declares the shape it
 * accepts on its own — so nothing in either package notices if the two drift.
 *
 * This gallery consumes both, which makes it the one place the question "does
 * what the runtime produces still fit what the agent accepts?" can be asked of
 * the published versions. It is asked here, at type level, by the gallery's
 * typecheck (CI runs it on every push). A drift fails that build.
 */

import type { EditContext } from "@vivariumjs/runtime";
import type { EditContextInput } from "@vivariumjs/agent";

type Fits<Produced, Accepted> = Produced extends Accepted ? true : false;

/** Fails to compile when the runtime's edit context no longer fits the agent's input. */
export const RUNTIME_EDIT_CONTEXT_FITS_AGENT_INPUT: Fits<EditContext, EditContextInput> = true;
