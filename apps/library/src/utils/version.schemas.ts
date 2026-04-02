import * as v from "valibot";
import type { SugarBoxSemanticVersionString } from "./version";

const SEMANTIC_VERSION_STRING_REGEX = /^\d+\.\d+\.\d+$/;

export const SemanticVersionStringSchema = v.pipe(
	v.string(),
	v.regex(SEMANTIC_VERSION_STRING_REGEX),
) as v.GenericSchema<SugarBoxSemanticVersionString>;
