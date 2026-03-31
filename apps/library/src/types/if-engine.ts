import type { SugarboxEngine } from "../engine/if-engine";
import type {
	SugarboxPlugin,
	SugarboxPluginSaveStructure,
} from "../plugins/plugin";
import type { SugarBoxSemanticVersionString } from "../utils/version";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./adapters";
import type { GenericSerializableObject } from "./shared";

/** Special information attached to every state snapshot */
type SugarBoxSnapshotMetadata = {
	/** Passage ID for the state snapshot
	 *
	 * Do **not** modify this property if you're using this library.
	 *
	 * @internal
	 */
	$$id: string;

	/** Current seed of the state at the moment.
	 *
	 * **Is a number between 0 and 2^32 - 1 (inclusive).**
	 *
	 * Do **not** modify this property if you're using this library.
	 *
	 * @internal
	 */
	$$seed: number;
};

/** Keys used for indexing save data
 *
 * Consists of the engine's name and save slot number
 */
type SugarBoxNormalSaveKey = `sugarbox-${string}-slot${number}`;

type SugarBoxAutoSaveKey = `sugarbox-${string}-autosave`;

type SugarBoxAchievementsKey = `sugarbox-${string}-achievements`;

type SugarBoxSettingsKey = `sugarbox-${string}-settings`;

type SugarBoxPluginSaveKey = `sugarbox-${string}-plugin-${string}`;

type SugarBoxSaveKey = SugarBoxAutoSaveKey | SugarBoxNormalSaveKey;

type SugarBoxAnyKey =
	| SugarBoxSaveKey
	| SugarBoxAchievementsKey
	| SugarBoxSettingsKey
	| SugarBoxPluginSaveKey;

/** Data structure used for saving the state of the engine
 *
 * Contains initial state, snapshots, current story index and other relevant metadata
 */
type SugarBoxSaveData<
	TSugarBoxVariables extends
		GenericSerializableObject = GenericSerializableObject,
> = Readonly<{
	intialState: TSugarBoxVariables & SugarBoxSnapshotMetadata;

	snapshots: Partial<TSugarBoxVariables & SugarBoxSnapshotMetadata>[];

	storyIndex: number;

	// Save metadata
	/** When the save was created */
	savedOn: Date;

	/** ID of the last passage that was navigated to */
	lastPassageId: string;

	/** A user-provided description for the save. TODO */
	// description?: string;

	/** Total play time in seconds. TODO */
	// playtimeInSeconds: number;

	/** The version of the story associated with this save */
	saveVersion: SugarBoxSemanticVersionString;

	/** Plugin data that should be altered / sync up when the user saves or loads save-data
	 *
	 * Indexed by the plugin's namespace */
	plugins: Record<string, SugarboxPluginSaveStructure>;
}>;

/** Export data structure used for saving the state of the engine to disk.
 *
 * Contains save data, settings, and achievements
 */
type SugarBoxExportData<
	TSaveData extends GenericSerializableObject = GenericSerializableObject,
	TSettingsData extends GenericSerializableObject = GenericSerializableObject,
	TAchievementData extends GenericSerializableObject = Record<string, boolean>,
> = {
	saveData: SugarBoxSaveData<TSaveData>;

	/** Story specific settings that shouldn't be tied to save data like audio volume, font size, etc */
	settings: TSettingsData;

	/** Achievements data that is not tied to save data.
	 *
	 * So it can persist across saves and be used to track achievements.
	 */
	achievements: TAchievementData;

	/** Plugin data that should be unaltered when the user saves or loads save-data
	 *
	 * Indexed by the plugin's namespace */
	plugins: Record<string, SugarboxPluginSaveStructure>;
};

/**
 * Decides how the compability of saves and the engine is calculated
 */
type SugarBoxSaveVersionCompatiblityMode = "strict" | "liberal";

type SugarBoxConfig<
	TSugarBoxVariables extends
		GenericSerializableObject = GenericSerializableObject,
	TPlugins extends SugarboxPlugin[] = SugarboxPlugin[],
> = {
	/** Maximum number of individual states that will be stored before old ones get merged into each other */
	maxStates: number;

	/** Number of individual states that will be merged into one when the state fills up */
	stateMergeCount: number;

	/** Maximum amount of saves at any given time.
	 *
	 * Must not be less than 1
	 *
	 * @default 20
	 */
	saveSlots: number;

	/** Semantic version to use for all newly created saves by the engine. Also acts as a reference point for the engine to determine if a previous save is compatible with the current version of the story.
	 *
	 */
	saveVersion: SugarBoxSemanticVersionString;

	/**
	 * Determines how strict the engine will be when deciding if a save is compatible the the current engine's version.
	 *
	 * If set to `strict`, the engine will only consider saves that only differ by the `patch` version as the current engine's version as compatible.
	 *
	 * If set to `liberal`, the engine will only consider saves that differ by the `patch` version, and have a lower or equal `minor` version as compatible.
	 *
	 * @default "strict"
	 */
	saveCompat: SugarBoxSaveVersionCompatiblityMode;

	/** If set to `passage`, the story variables are saved on every passage navigation to a special save slot
	 *
	 * If set to `state`, the story variables are saved on every state change (i.e when a variable is changed) to a special save slot
	 *
	 * @default false
	 */
	autoSave: "passage" | "state" | false;

	/**
	 * If `true`, the most recent save (if any) will be loaded when the engine is initialized
	 *
	 * @default true
	 */
	loadOnStart: boolean;

	/** Determines whether or not save/achievement/settings data will be compressed.
	 *
	 * Note that even when this is enabled, compression will not occur unless the stringified data is long enough (> 1KB)
	 *
	 * @default true
	 */
	compress: boolean;

	/** Intial seed for predictable rng.
	 *
	 * **Must be a number between 0 and 2^32 - 1 (inclusive).**
	 *
	 * @default a random number between 0 and 2^32 - 1
	 */
	initialSeed?: number;

	/** Determines if and when the prng seed will be regenerated.
	 *
	 * If set to `passage`, the seed will be regenerated on every passage navigation.
	 *
	 * If set to `eachCall`, the seed will be regenerated on every call to the `random` getter.
	 *
	 * If set to `false`, the seed will not be regenerated at all. Essentially, the engine will use the initial seed for all random number generation.
	 *
	 * @default "passage"
	 */
	regenSeed: "passage" | "eachCall" | false;

	/** Optional cache adapter to use to speed up state fetching */
	cache?: SugarBoxCacheAdapter<TSugarBoxVariables>;

	/** Optional persistence adapter for saving support.
	 *
	 * @default defaults to an imemory adapter
	 */
	persistence: SugarBoxPersistenceAdapter;

	/** Optimization strategy for state change events.
	 *
	 * This setting controls how the engine handles state snapshots when emitting
	 * `:stateChange` events, balancing between performance and data accuracy.
	 *
	 * **Performance Impact:**
	 * - `acc` (acc): Deep clones the old state before modifications, ensuring complete
	 *   isolation between `oldState` and `newState` objects. Use when you need
	 *   guaranteed data integrity but may impact performance with large state objects.
	 *
	 * - `perf` (performance): Avoids deep cloning for better performance. In rare edge cases
	 *   with complex state caching scenarios, `oldState` and `newState` might reference
	 *   the same object, but provides significant performance benefits for large states.
	 *
	 * @default "acc"
	 */
	emitMode?: "perf" | "acc";

	/** Optional plugins to mount onto the engine.
	 *
	 * @default []
	 */
	plugins?: TPlugins;
};

type SugarBoxPassage<
	TPassageType,
	TPassageTag extends string = string,
	TPassageName extends string = string,
> = Readonly<{
	/** Unique identifier for the passage in the engine */
	name: TPassageName;
	/** Passage data. Whatever this is is up to you. */
	data: TPassageType;
	/** Optional tags for querying this and related passages.
	 *
	 */
	tags: ReadonlyArray<TPassageTag>;
}>;

type SugarBoxStorylet<TEngine extends SugarboxEngine> = {
	name: string;
	/** Higher priority = Earlier in the resulting array when querying for vaild storylets */
	priority: number;

	/** Must return `true` for the Storylet to be eligble for the current passage and state.
	 *
	 * Couldn't decide on what properties to expose so it gets the whole engine
	 */
	requirement: (engine: TEngine) => boolean;

	/** The id / name of the passage to be returned if this storylet requirement callback resolves to `true`  */
	passageId: TEngine["passageId"];
};

export type {
	SugarBoxConfig,
	SugarBoxSnapshotMetadata,
	SugarBoxNormalSaveKey,
	SugarBoxAnyKey,
	SugarBoxSaveKey,
	SugarBoxPluginSaveKey,
	SugarBoxSaveData,
	SugarBoxExportData,
	SugarBoxAchievementsKey,
	SugarBoxSettingsKey,
	SugarBoxPassage,
	SugarBoxAutoSaveKey,
	SugarBoxSaveVersionCompatiblityMode,
	SugarBoxStorylet,
};
