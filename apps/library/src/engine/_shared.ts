import type { ChoicekitClassConstructorWithValidSerialization } from "@packages/serializer";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../_internal/models/shared";
import type { ChoicekitSemanticVersionString } from "../_internal/utils/version";
import type { ChoicekitPlugin } from "../plugins/plugin";
import type { ChoicekitType } from "./types/Choicekit";

export type ChoicekitSaveMigration<
	TOldSaveStructure,
	TNewSaveStructure,
	TNewVersion extends
		ChoicekitSemanticVersionString = ChoicekitSemanticVersionString,
> = {
	/** Version that the save will be set to if the migration function works */
	to: TNewVersion;

	/** Function to be run on the old save data to migrate it to the given version */
	migrater: (saveDataToMigrate: TOldSaveStructure) => TNewSaveStructure;
};

export type ChoicekitSaveMigrationMap<
	TOldSaveStructure,
	TNewSaveStructure,
	TOldVersion extends
		ChoicekitSemanticVersionString = ChoicekitSemanticVersionString,
	TNewVersion extends
		ChoicekitSemanticVersionString = ChoicekitSemanticVersionString,
> = Map<
	TOldVersion,
	ChoicekitSaveMigration<TOldSaveStructure, TNewSaveStructure, TNewVersion>
>;

export interface ChoicekitEngineGenerics {
	passages: ChoicekitType.Passage<unknown, string, string>;
	vars: GenericSerializableObject;
	name: string;
	plugins: ChoicekitPlugin[];
}

/** Relevant data that can be made available for the variable intialization for the engine e.g PRNG */
export interface ChoicekitEngineVariableInitData {
	/** The prng random value between 0 and 1 */
	readonly prng: number;
}

export interface ChoicekitEngineArguments<
	TEngineGenerics extends ChoicekitEngineGenerics = ChoicekitEngineGenerics,
> {
	/** Name of the engine. Engines initalized with the same name have access to the same saves, acheivements, and story-specific settings */
	name: TEngineGenerics["name"];

	/** The initial set of variables to be uses as the starting state.
	 *
	 * May optionally be a callback in the case that the variables require some specific data from the initialized engine (maybe, using the PRNG)
	 */
	vars:
		| TEngineGenerics["vars"]
		| ((init: ChoicekitEngineVariableInitData) => TEngineGenerics["vars"]);

	/** All the passages to intialize asap.
	 *
	 * The first element is the starting passage.
	 */
	passages: [TEngineGenerics["passages"], ...TEngineGenerics["passages"][]];

	/** So you don't have to manually register classes for proper serialization / deserialization */
	classes: ChoicekitClassConstructorWithValidSerialization[];

	config: Partial<ChoicekitType.Config<TEngineGenerics["vars"]>>;

	/** If the engine had been intialised before with a lower version.
	 *
	 * Add migrations to this array to migrate the old save data to the new version.
	 */
	migrations: {
		from: ChoicekitSemanticVersionString;
		data: ChoicekitSaveMigration<never, unknown>;
	}[];

	/** Plugins (and their user-provided config) to mount at initialization.
	 *
	 * Each entry will be mounted in the order provided during `init`.
	 */
	plugins?: {
		plugin: ChoicekitPlugin;
		config?: GenericObject | undefined;
	}[];
}
