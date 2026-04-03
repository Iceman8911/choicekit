import type { SugarboxClassConstructorWithValidSerialization } from "@packages/serializer";
import type { SugarboxType } from "../types/sugarbox";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../../_internal/models/shared";
import type { SugarBoxSemanticVersionString } from "../../_internal/utils/version";
import type { SugarboxPlugin } from "../../plugins/plugin";

export type SugarBoxSaveMigration<
	TOldSaveStructure,
	TNewSaveStructure,
	TNewVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
> = {
	/** Version that the save will be set to if the migration function works */
	to: TNewVersion;

	/** Function to be run on the old save data to migrate it to the given version */
	migrater: (saveDataToMigrate: TOldSaveStructure) => TNewSaveStructure;
};

export type SugarBoxSaveMigrationMap<
	TOldSaveStructure,
	TNewSaveStructure,
	TOldVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
	TNewVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
> = Map<
	TOldVersion,
	SugarBoxSaveMigration<TOldSaveStructure, TNewSaveStructure, TNewVersion>
>;

export interface SugarBoxEngineGenerics {
	passages: SugarboxType.Passage<unknown, string, string>;
	vars: GenericSerializableObject;
	settings: GenericSerializableObject;
	achievements: GenericSerializableObject;
	name: string;
	plugins: SugarboxPlugin[];
}

/** Relevant data that can be made available for the variable intialization for the engine e.g PRNG */
export interface SugarBoxEngineVariableInitData {
	/** The prng random value between 0 and 1 */
	readonly prng: number;
}

export interface SugarBoxEngineArguments<
	TEngineGenerics extends SugarBoxEngineGenerics = SugarBoxEngineGenerics,
> {
	/** Name of the engine. Engines initalized with the same name have access to the same saves, acheivements, and story-specific settings */
	name: TEngineGenerics["name"];

	/** The initial set of variables to be uses as the starting state.
	 *
	 * May optionally be a callback in the case that the variables require some specific data from the initialized engine (maybe, using the PRNG)
	 */
	vars:
		| TEngineGenerics["vars"]
		| ((init: SugarBoxEngineVariableInitData) => TEngineGenerics["vars"]);

	/** All the passages to intialize asap.
	 *
	 * The first element is the starting passage.
	 */
	passages: [TEngineGenerics["passages"], ...TEngineGenerics["passages"][]];

	/** So you don't have to manually register classes for proper serialization / deserialization */
	classes: SugarboxClassConstructorWithValidSerialization[];

	/** Achievements that should persist across saves */
	achievements: TEngineGenerics["achievements"];

	/** Settings data that is not tied to save data, like audio volume, font size, etc */
	settings: TEngineGenerics["settings"];

	config: Partial<SugarboxType.Config<TEngineGenerics["vars"]>>;

	/** If the engine had been intialised before with a lower version.
	 *
	 * Add migrations to this array to migrate the old save data to the new version.
	 */
	migrations: {
		from: SugarBoxSemanticVersionString;
		data: SugarBoxSaveMigration<never, unknown>;
	}[];

	/** Plugins (and their user-provided config) to mount at initialization.
	 *
	 * Each entry will be mounted in the order provided during `init`.
	 */
	plugins?: {
		plugin: SugarboxPlugin;
		config?: GenericObject | undefined;
	}[];
}
