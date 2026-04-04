import type {
	ChoicekitClassConstructor,
	ChoicekitClassInstance,
} from "@packages/engine-class";
import type { GenericSerializableObject } from "../../_internal/models/shared";
import type { ChoicekitSemanticVersionString } from "../../_internal/utils/version";
import type {
	ChoicekitPlugin,
	ChoicekitPluginInputGenerics,
	ChoicekitPluginSaveStructure,
	ValidatePluginGenerics as ValidatePluginGenericsType,
} from "../../plugins/plugin";
import type { ChoicekitEngine } from "../if-engine";

export declare namespace ChoicekitType {
	/** All userland custom classes need to implement this if they must be part of the story's state */
	export type ClassInstance<TSerializedStructure = unknown> =
		ChoicekitClassInstance<TSerializedStructure>;

	/** All userland custom class constructors need to implement this if they must be part of the story's state */
	export type ClassConstructor<TSerializedStructure = unknown> =
		ChoicekitClassConstructor<TSerializedStructure>;

	/** Special information attached to every state snapshot */
	export type SnapshotMetadata = {
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

	/** Cache adapter for state snapshot caching */
	export type CacheAdapter<TStateVariables extends GenericSerializableObject> =
		{
			set(key: number, data: TStateVariables & SnapshotMetadata): unknown;

			get(key: number): (TStateVariables & SnapshotMetadata) | undefined | null;

			delete(key: number): unknown;

			clear(): unknown;
		};

	/** Persistence adapter for save payload storage */
	export type PersistenceAdapter = {
		set(key: AnyKey, data: string): Promise<unknown>;

		get(key: AnyKey): Promise<string | undefined | null>;

		delete(key: AnyKey): Promise<unknown>;

		/** If provided, makes returning an iterable / list of used save slots more efficient. Otherwise, `get()` will be used as a workaround */
		keys?(): Promise<Iterable<AnyKey | string>>;
	};

	/** Generic input shape for plugin type definitions */
	export type PluginInputGenerics = ChoicekitPluginInputGenerics;

	/** Typed helper for creating plugin generics */
	export type ValidatePluginGenerics<
		TGenerics extends ChoicekitPluginInputGenerics,
	> = ValidatePluginGenericsType<TGenerics>;

	/** Plugin type shape */
	export type Plugin<
		TGenerics extends
			ChoicekitPluginInputGenerics = ChoicekitPluginInputGenerics,
		TMode extends "input" | "output" = "output",
	> = ChoicekitPlugin<TGenerics, TMode>;

	/** Serialized plugin save payload */
	export type PluginSaveStructure = ChoicekitPluginSaveStructure;

	/** Keys used for indexing save data
	 *
	 * Consists of the engine's name and save slot number
	 */
	export type NormalSaveKey = `Choicekit-${string}-slot${number}`;

	export type AutoSaveKey = `Choicekit-${string}-autosave`;

	export type PluginSaveKey = `Choicekit-${string}-plugin-${string}`;

	export type SaveKey = AutoSaveKey | NormalSaveKey;

	export type AnyKey = SaveKey | PluginSaveKey;

	/** Data structure used for saving the state of the engine
	 *
	 * Contains initial state, snapshots, current story index and other relevant metadata
	 */
	export type SaveData<
		TChoicekitVariables extends
			GenericSerializableObject = GenericSerializableObject,
	> = Readonly<{
		intialState: TChoicekitVariables & SnapshotMetadata;

		snapshots: Partial<TChoicekitVariables & SnapshotMetadata>[];

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
		version: ChoicekitSemanticVersionString;

		/** Plugin data that should be altered / sync up when the user saves or loads save-data
		 *
		 * Indexed by the plugin's namespace */
		plugins: Record<string, ChoicekitPluginSaveStructure>;
	}>;

	/** Export data structure used for saving the state of the engine to disk.
	 *
	 * Contains save data and plugin data in a serialized package
	 */
	export type ExportData<
		TSaveData extends GenericSerializableObject = GenericSerializableObject,
	> = {
		saveData: SaveData<TSaveData>;

		/** Plugin data that should be unaltered when the user saves or loads save-data
		 *
		 * Indexed by the plugin's namespace */
		plugins: Record<string, ChoicekitPluginSaveStructure>;
	};

	/**
	 * Decides how the compability of saves and the engine is calculated
	 */
	export type SaveVersionCompatiblityMode = "strict" | "liberal";

	export type Config<
		TChoicekitVariables extends
			GenericSerializableObject = GenericSerializableObject,
		TPlugins extends Plugin[] = Plugin[],
	> = {
		/** Maximum number of individual states that will be stored before old ones get merged into each other */
		maxStates: number;

		/** Number of individual states that will be merged into one when the state fills up */
		stateMergeCount: number;

		/** Maximum amount of manual saves at any given time.
		 *
		 * Must not be less than 1.
		 *
		 * Does not count the autosave slot.
		 *
		 * @default 20
		 */
		saveSlots: number;

		/** Semantic version to use for all newly created saves by the engine. Also acts as a reference point for the engine to determine if a previous save is compatible with the current version of the story.
		 *
		 */
		saveVersion: ChoicekitSemanticVersionString;

		/**
		 * Determines how strict the engine will be when deciding if a save is compatible the the current engine's version.
		 *
		 * If set to `strict`, the engine will only consider saves that only differ by the `patch` version as the current engine's version as compatible.
		 *
		 * If set to `liberal`, the engine will only consider saves that differ by the `patch` version, and have a lower or equal `minor` version as compatible.
		 *
		 * @default "strict"
		 */
		saveCompat: SaveVersionCompatiblityMode;

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

		/** Determines whether or not saved data will be compressed.
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
		cache?: CacheAdapter<TChoicekitVariables>;

		/** Optional persistence adapter for saving support.
		 *
		 * @default defaults to an imemory adapter
		 */
		persistence: PersistenceAdapter;

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

	export type Passage<
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

	export type Storylet<TEngine extends ChoicekitEngine> = {
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
}
