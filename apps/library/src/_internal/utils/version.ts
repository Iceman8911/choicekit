import type { SugarboxType } from "../../engine/types/sugarbox";

type SemanticVersionTuple = readonly [
	major: number,
	minor: number,
	patch: number,
];

/** Simple semantic versioning string */
type SemanticVersionString = `${number}.${number}.${number}`;

const getMajorAndMinorAndPatchFromVersionString = (
	versionString: SemanticVersionString,
): SemanticVersionTuple =>
	//@ts-expect-error This is a valid tuple type, but TS doesn't recognize it as such
	versionString.split(".").map((num) => +num);

const isSaveCompatibleWithEngine = (
	saveVersion: SemanticVersionString,
	engineVersion: SemanticVersionString,
	compatibilityMode: SugarboxType.SaveVersionCompatiblityMode,
): "compat" | "old" | "new" => {
	const [svMajor, svMinor] =
		getMajorAndMinorAndPatchFromVersionString(saveVersion);
	const [evMajor, evMinor] =
		getMajorAndMinorAndPatchFromVersionString(engineVersion);

	if (svMajor > evMajor) {
		return "new";
	}

	if (svMajor < evMajor) {
		return "old";
	}

	switch (compatibilityMode) {
		case "strict": {
			if (svMinor > evMinor) {
				return "new";
			}

			if (svMinor < evMinor) {
				return "old";
			}

			break;
		}

		case "liberal":
			// Backwards compatible within same major
			if (svMinor > evMinor) {
				return "new";
			}
	}

	return "compat";
};

export {
	isSaveCompatibleWithEngine,
	type SemanticVersionString as SugarBoxSemanticVersionString,
	type SemanticVersionTuple as SugarBoxSemanticVersionTuple,
};
