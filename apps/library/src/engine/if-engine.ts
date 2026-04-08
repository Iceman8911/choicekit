// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import PRNG from "@iceman8911/tiny-prng/prng";
import { TypedEventEmitter } from "@packages/event-emitter";
import {
	type ChoicekitClassConstructorWithValidSerialization,
	clone,
	deserialize,
	registerClass,
	serialize,
	type TransformableOrJsonSerializableType,
} from "@packages/serializer";
import {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
} from "@packages/string-compression";
import * as v from "valibot";
import {
	ChoicekitExportDataSchema,
	ChoicekitPluginSaveStructureSchema,
	ChoicekitSaveDataSchema,
	ChoicekitSaveMetadataSchema,
} from "../_internal/models/if-engine.schemas";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../_internal/models/shared";
import {
	type ChoicekitSemanticVersionString,
	isSaveCompatibleWithEngine,
} from "../_internal/utils/version";
import { InMemoryPersistenceAdapter } from "../adapters/persistence/in-memory";
import type {
	ChoicekitDependencyConfigResolver,
	ChoicekitPlugin,
	ChoicekitPluginSaveStructure,
	MapPluginsToApiSurface,
} from "../plugins/plugin";
import type {
	ChoicekitEngineArguments,
	ChoicekitEngineGenerics,
	ChoicekitEngineVariableInitData,
	ChoicekitSaveMigration,
	ChoicekitSaveMigrationMap,
} from "./_shared";
import type { ChoicekitType } from "./types/Choicekit";

const DEFAULT_CONFIG = {
	autoSave: false,

	compress: true,

	emitMode: "acc",

	loadOnStart: true,

	maxStates: 100,

	persistence: InMemoryPersistenceAdapter,

	plugins: [],

	regenSeed: "passage",

	saveCompat: "strict",

	saveSlots: 20,

	saveVersion: `0.0.1`,

	stateMergeCount: 1,
} as const satisfies ChoicekitType.Config;

const MINIMUM_SAVE_SLOT_INDEX = 0;

const MINIMUM_SAVE_SLOTS = 1;

const SAVE_SLOT_NUMBER_REGEX = /slot(\d+)-meta$/;

type StateWithMetadata<TVariables extends GenericSerializableObject> =
	TVariables & ChoicekitType.SnapshotMetadata;

type SnapshotWithMetadata<TVariables extends GenericSerializableObject> =
	Partial<TVariables & ChoicekitType.SnapshotMetadata>;

type SaveStartEvent = { slot: "autosave" | "export" | "recent" | number };

type SaveEndEvent =
	| { type: "success"; slot: "autosave" | "export" | "recent" | number }
	| {
			type: "error";
			error: Error;
			slot: "autosave" | "export" | "recent" | number;
	  };

type DeleteStartEvent = { slot: "autosave" | number };

type DeleteEndEvent =
	| { type: "success"; slot: "autosave" | number }
	| { type: "error"; error: Error; slot: "autosave" | number };

/** Events fired from a `ChoicekitEngine` instance */
type ChoicekitEvents<TPassageData, TStateVariables> = {
	engineReset: Readonly<{
		newSeed: number;
	}>;

	historyChange: Readonly<{
		oldIndex: number;
		newIndex: number;
	}>;

	passageChange: Readonly<{
		oldPassage: TPassageData | null;
		newPassage: TPassageData | null;
	}>;

	stateChange: Readonly<{
		oldState: TStateVariables;
		newState: TStateVariables;
	}>;

	saveStart: SaveStartEvent;

	saveEnd: SaveEndEvent;

	loadStart: SaveStartEvent;

	loadEnd: SaveEndEvent;

	deleteStart: DeleteStartEvent;

	deleteEnd: DeleteEndEvent;

	migrationStart: Readonly<{
		fromVersion: ChoicekitSemanticVersionString;
		toVersion: ChoicekitSemanticVersionString;
	}>;

	migrationEnd: Readonly<
		| {
				type: "success";
				fromVersion: ChoicekitSemanticVersionString;
				toVersion: ChoicekitSemanticVersionString;
		  }
		| {
				type: "error";
				fromVersion: ChoicekitSemanticVersionString;
				toVersion: ChoicekitSemanticVersionString;
				error: Error;
		  }
	>;
};

type SaveOrLoadReturnType<TSuccessVal = void> =
	| { success: true; data: TSuccessVal }
	| { success: false; err: Error };

/** The main engine for Choicekit that provides headless interface to basic utilities required for Interactive Fiction
 *
 * Dispatches custom events that can be listened to with "addEventListener"
 */
class ChoicekitEngine<
	const TEngineGenerics extends
		ChoicekitEngineGenerics = ChoicekitEngineGenerics,
> {
	/** Must be unique to prevent conflicts */
	readonly name: TEngineGenerics["name"];

	//@ts-expect-error Inference Limitation
	$: MapPluginsToApiSurface<TEngineGenerics["plugins"]> = {};

	private declare _type: {
		engine: ChoicekitEngine<TEngineGenerics>;
		passage: TEngineGenerics["passages"];
		config: ChoicekitType.Config<
			TEngineGenerics["vars"],
			TEngineGenerics["plugins"]
		>;
		state: {
			complete: StateWithMetadata<TEngineGenerics["vars"]>;
			snapshot: SnapshotWithMetadata<TEngineGenerics["vars"]>;
		};
		saveData: ChoicekitType.SaveData<TEngineGenerics["vars"]>;
		exportData: ChoicekitType.ExportData<TEngineGenerics["vars"]>;
		adapter: {
			cache: ChoicekitType.CacheAdapter<TEngineGenerics["vars"]>;
		};
		events: ChoicekitEvents<
			TEngineGenerics["passages"],
			TEngineGenerics["vars"]
		>;
	};

	#config!: typeof this._type.config;

	#eventEmitter = new TypedEventEmitter<{
		[KEventName in keyof typeof this._type.events]: (typeof this._type.events)[KEventName];
	}>();

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 */
	#index: number = 0;

	/**  Contains the structure of stateful variables in the engine.
	 *
	 * Will not be modified after initialization.
	 */
	//@ts-expect-error For convenience
	#initialState: Readonly<typeof this._type.state.complete> = {};

	/** Indexed by the passage id.
	 *
	 * Each value is the passage data, which could be a html string, markdown string, regular string, or more complex things like a jsx component, etc.
	 */
	#passages = new Map<
		typeof this._type.passage.name,
		typeof this._type.passage
	>();

	/** Collection of migration functions to keep old saves up to date
	 *
	 * Not sure what types to put here without overcomplicating things
	 */
	// biome-ignore lint/suspicious/noExplicitAny: <It'll not be worth defining the types for these>
	#saveMigrationMap: ChoicekitSaveMigrationMap<any, any> = new Map();

	/** Since recalculating the current state can be expensive */
	#stateCache?: typeof this._type.adapter.cache;

	/** Contains partial updates to the state as a result of moving forwards in the story.
	 *
	 * This is also the "state history"
	 */
	#stateSnapshots: Array<typeof this._type.state.snapshot> = [];

	#plugins = new Map<string, ChoicekitPlugin>();
	#pluginConfig = new Map<string, GenericObject>();
	#pluginState = new Map<string, GenericObject>();

	private constructor(args: {
		classes: ChoicekitClassConstructorWithValidSerialization[];
		config: ChoicekitType.Config<
			TEngineGenerics["vars"],
			TEngineGenerics["plugins"]
		>;
		migrations: {
			from: ChoicekitSemanticVersionString;
			data: ChoicekitSaveMigration<never, unknown>;
		}[];
		name: TEngineGenerics["name"];
		passages: [TEngineGenerics["passages"], ...TEngineGenerics["passages"][]];
		vars:
			| TEngineGenerics["vars"]
			| ((init: ChoicekitEngineVariableInitData) => TEngineGenerics["vars"]);
	}) {
		const { classes, config, migrations, name, passages, vars } = args;
		const initialSeed = config.initialSeed ?? getRandomInteger();
		config.initialSeed = initialSeed;

		const metadata = {
			$$id: passages[0].name,
			$$plugins: new Map(),
			$$seed: initialSeed,
		} satisfies ChoicekitType.SnapshotMetadata;

		this.name = name;
		this.#config = config;
		this.#stateSnapshots = [clone(metadata)];

		for (const passage of passages) {
			this.#passages.set(passage.name, passage);
		}

		if (config.cache) {
			this.#stateCache = config.cache;
		}

		const isInitialStateCallback = vars instanceof Function;

		Object.assign(
			this.#initialState,
			metadata,
			isInitialStateCallback ? vars({ prng: this.random }) : vars,
		);

		this.registerClasses(...classes);
		this.registerMigrators(...migrations);
	}

	static async init<const TGenerics extends ChoicekitEngineGenerics>(
		args: Partial<ChoicekitEngineArguments<TGenerics>>,
	): Promise<ChoicekitEngine<TGenerics>> {
		const {
			config = { ...DEFAULT_CONFIG },
			name = "",
			passages = [{ data: "", name: "", tags: [] }],
			classes = [],
			migrations = [],
			vars = {},
		} = args;

		// Merge config up-front so the constructor receives a fully-merged configuration
		const mergedConfig = {
			...DEFAULT_CONFIG,
			...(config ?? {}),
		} as ChoicekitType.Config<TGenerics["vars"]>;

		mergedConfig.initialSeed ??= getRandomInteger();

		const { saveSlots } = mergedConfig;

		if (saveSlots && saveSlots < MINIMUM_SAVE_SLOTS)
			throw Error(`Invalid number of save slots: ${saveSlots}`);

		const engine = new ChoicekitEngine<TGenerics>({
			classes,
			config: mergedConfig as ChoicekitType.Config<
				TGenerics["vars"],
				TGenerics["plugins"]
			>,
			migrations,
			name,
			passages,
			vars,
		});

		// Mount plugins provided via builder/plugin args, or fallback to config.plugins.
		const initPlugins =
			args.plugins ??
			mergedConfig.plugins?.map((plugin) => ({
				config: undefined,
				plugin,
			})) ??
			[];
		for (const entry of initPlugins) {
			const { plugin: pluginToUse, config: pluginConfig } = entry;

			await engine.#usePlugin(pluginToUse, pluginConfig);
		}

		const { loadOnStart } = config;

		// Also load the most recent save if `loadOnStart` is true
		await Promise.allSettled([loadOnStart ? engine.loadRecentSave() : ""]);

		return engine;
	}

	// State mutation and navigation

	/** Immer-style way of updating story variables
	 *
	 * Use this **solely** for setting values. If you must read a value, use `this.vars`
	 *
	 * **If you need to replace the entire state, *return a new object* instead of directly *assigning the value***
	 *
	 * @param [emitEvent=true] If true, a "stateChange" event will be emitted. Set this to false if you use it within a `stateChange` listener
	 */
	setVars(
		producer:
			| ((variables: TEngineGenerics["vars"]) => void)
			| ((variables: TEngineGenerics["vars"]) => TEngineGenerics["vars"]),
		emitEvent = true,
	): void {
		const self = this;

		const snapshot = self.#getSnapshotAtIndex(self.#index);

		const oldState = this.#shouldCloneOldState ? clone(self.vars) : self.vars;

		type SnapshotProp = keyof typeof snapshot | symbol;

		const proxy = new Proxy(snapshot, {
			// To ensure that when attempting to set the values of nested properties (`variables.inventory?.gold = 30`), the missing value (`inventory`) is copied over
			get(target, prop: SnapshotProp, receiver) {
				if (typeof prop !== "symbol") {
					const originalValue = target[prop];

					// Since it is undefined, copy over the property from the previous state
					if (originalValue === undefined) {
						const previousStateValue = self.#getStateAtIndex(self.#index - 1)[
							prop
						];

						//@ts-expect-error tired of fighting ts :p
						target[prop] = clone(previousStateValue);
					}
				}

				return Reflect.get(target, prop, receiver);
			},
		});

		const possibleValueToUseForReplacing = producer(proxy);

		if (possibleValueToUseForReplacing) {
			this.#rewriteState({
				...this.vars,
				...possibleValueToUseForReplacing,
			});
		}

		// Clear the cache entry for this since it has been changed
		self.#stateCache?.delete(self.#index);

		const newState = self.#getStateAtIndex(self.#index);

		if (emitEvent) {
			self.#emitCustomEvent("stateChange", {
				newState,
				oldState,
			});
		}
	}

	/** Adds new passages to the engine.
	 *
	 * The passage id should be unique, and the data can be anything that you want to store for the passage.
	 *
	 * If the passage already exists, it will be overwritten.
	 *
	 * @throws if a passage with the same name already exists
	 */
	addPassages(...passageData: ReadonlyArray<typeof this._type.passage>): void {
		for (const passageDatum of passageData) {
			if (this.#passages.has(passageDatum.name))
				throw Error(`Passage with name ${passageDatum.name} already exists`);

			this.#passages.set(passageDatum.name, passageDatum);
		}
	}

	/** Moves at least one step backwards in the state history.
	 *
	 * Does nothing if already at the first state snapshot.
	 */
	backward(step = 1): void {
		const newIndex = this.#index - step;

		if (newIndex < 0) {
			this.#setIndex(0);
		} else {
			this.#setIndex(newIndex);
		}
	}

	/** Moves at least one step forward in the state history.
	 *
	 * Does nothing if already at the most recent state snapshot.
	 */
	forward(step = 1): void {
		const newIndex = this.#index + step;

		if (newIndex >= this.#snapshotCount) {
			this.#setIndex(this.#lastSnapshotIndex);
		} else {
			this.#setIndex(newIndex);
		}
	}

	/** Creates and moves the index over to a new snapshot with the given passage id (or the previous one) and returns a reference to it.
	 *
	 * This is essentially the way of linking between passages in the story.
	 *
	 * Yes, you can navigate to the same passage multiple times, and it will create a new snapshot each time. It's intended behavior.
	 *
	 * @throws if the passage id hasn't been added to the engine
	 */
	navigateTo(
		passageId: TEngineGenerics["passages"]["name"] = this.passageId,
	): typeof this._type.state.snapshot {
		if (!this.#isPassageIdValid(passageId))
			throw Error(
				`Cannot navigate: Passage with ID '${passageId}' not found. Add it using addPassages().`,
			);

		const newSnapshot = this.#addNewSnapshot();

		if (this.vars.$$id !== passageId) {
			//@ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `$$id` property
			newSnapshot.$$id = passageId;
		}

		if (this.#config.regenSeed === "passage") {
			//@ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `$$seed` property
			// Create a new seed for the new snapshot
			newSnapshot.$$seed = this.#currentStatePrng.next();
		}

		this.#setIndex(this.#index + 1);

		return newSnapshot;
	}

	// Story queries
	/** Returns an array of passages that match the specified tags.
	 *
	 * @param tags - Optional. An array of tags to filter the passages.
	 * @returns An array of passages that match the specified tags.
	 */
	getPassages(
		query:
			| {
					/** Matches any passage that has all of the given tags */
					type: "all";
					tags: [...TEngineGenerics["passages"]["tags"]];
			  }
			| {
					/** Matches any passage that has at least one of the given tags */
					type: "any";
					tags: [...TEngineGenerics["passages"]["tags"]];
			  },
	): ReadonlyArray<typeof this._type.passage> {
		const matchedPassages: (typeof this._type.passage)[] = [];

		const doesMatchPassageDataTags = (
			tag: TEngineGenerics["passages"]["tags"][number],
			passageData: typeof this._type.passage,
		) => !!passageData.tags?.includes(tag);

		const { type, tags } = query;

		for (const [_, passageData] of this.#passages) {
			if (type === "any") {
				if (tags.some((tag) => doesMatchPassageDataTags(tag, passageData))) {
					matchedPassages.push(passageData);
				}
			} else {
				if (tags.every((tag) => doesMatchPassageDataTags(tag, passageData))) {
					matchedPassages.push(passageData);
				}
			}
		}

		return matchedPassages;
	}

	/** Gets all the times the passage has been visited by looping through each snapshot and initial state.
	 *
	 * Use this in place of `hasVisited(id)`, i.e `getVisitCount(id) > 0`
	 *
	 * @param [passageId=this.passageId]
	 *
	 * TODO: benchmark this later to see if caching will be beneficial
	 */
	getVisitCount(
		passageId: typeof this._type.passage.name = this.passageId,
	): number {
		let count = this.#initialState.$$id === passageId ? 1 : 0;

		const snapshots = this.#stateSnapshots;
		const limit = Math.min(this.#index, snapshots.length);

		for (let i = 0; i < limit; i++) {
			if (snapshots[i]?.$$id === passageId) {
				count++;
			}
		}

		return count;
	}

	// Persistence: load, save, list, delete

	/** Returns an async generator containing the data of all present saves.
	 *
	 * Save data is a lazy callback to prevent wasteful deserialization and decompression of save data that may not be used.
	 */
	async *getSaves(): AsyncGenerator<
		(
			| {
					type: "autosave";
			  }
			| {
					type: "normal";
					/** Save slot number */
					slot: number;
			  }
		) & {
			/** Lightweight metadata about the save */
			meta: ChoicekitType.SaveMetadata;

			/** Callback for getting the bulk of the actual save data */
			getData(): Promise<ChoicekitType.SaveData<TEngineGenerics["vars"]>>;
		}
	> {
		const engineAutoSaveKey = this.#getAutoSaveMetaStorageKey();

		for await (const key of this.#getMetaKeysOfPresentSaves()) {
			const serializedSaveMeta = await this.#persistenceAdapter.get(key);

			if (!serializedSaveMeta) continue;

			const meta = v.parse(
				ChoicekitSaveMetadataSchema,
				deserialize(
					await decompressPossiblyCompressedJsonString(serializedSaveMeta),
				),
			);

			const isAutoSaveKey = key === engineAutoSaveKey;
			const slotNumber = Number(key.match(SAVE_SLOT_NUMBER_REGEX)?.[1] ?? -1);
			const saveDataKey = isAutoSaveKey
				? this.#getAutoSaveDataStorageKey()
				: this.#getSaveSlotDataStorageKey(slotNumber);

			const getData = async (): Promise<typeof this._type.saveData> => {
				const serializedSaveData =
					await this.#persistenceAdapter.get(saveDataKey);

				if (!serializedSaveData) {
					throw Error(
						`No save data found for ${isAutoSaveKey ? "autosave" : `slot ${slotNumber}`}`,
					);
				}

				return v.parse(
					ChoicekitSaveDataSchema,
					deserialize(
						await decompressPossiblyCompressedJsonString(serializedSaveData),
					),
				);
			};

			if (isAutoSaveKey) {
				yield { getData, meta, type: "autosave" };
			} else {
				yield { getData, meta, slot: slotNumber, type: "normal" };
			}
		}
	}

	/** Can be used when directly loading a save from an exported save on disk
	 */
	async loadFromExport(data: string): Promise<SaveOrLoadReturnType> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			"export",
			async () => {
				const jsonString = await decompressPossiblyCompressedJsonString(data);

				const { saveData, plugins }: typeof this._type.exportData = v.parse(
					ChoicekitExportDataSchema,
					deserialize(jsonString),
				);

				this.#loadAllPluginSerializableDataFromRecord(plugins);

				// Replace the current state and propagate any load failures
				const loadResult = this.loadFromObject(saveData);

				if (!loadResult.success) {
					throw loadResult.err;
				}
			},
		);
	}

	/**
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 */
	async loadFromSaveSlot(saveSlot?: number): Promise<SaveOrLoadReturnType> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			saveSlot,
			async () => {
				const saveMetaKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotMetaStorageKey(saveSlot)
						: this.#getAutoSaveMetaStorageKey();

				const saveDataKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotDataStorageKey(saveSlot)
						: this.#getAutoSaveDataStorageKey();

				const serializedSaveMeta =
					await this.#persistenceAdapter.get(saveMetaKey);
				const serializedSaveData =
					await this.#persistenceAdapter.get(saveDataKey);

				if (!serializedSaveMeta || !serializedSaveData) {
					throw Error(`No save data found for slot ${saveSlot}`);
				}

				const [meta, data] = await Promise.all([
					decompressPossiblyCompressedJsonString(serializedSaveMeta).then(
						(str) => v.parse(ChoicekitSaveMetadataSchema, deserialize(str)),
					),
					decompressPossiblyCompressedJsonString(serializedSaveData).then(
						(str) => v.parse(ChoicekitSaveDataSchema, deserialize(str)),
					),
				]);

				const loadResult = this.loadFromObject({
					data,
					meta,
				});

				if (!loadResult.success) {
					throw loadResult.err;
				}
			},
		);
	}

	/** Loads the most recent save, if any. Doesn't throw */
	async loadRecentSave(): Promise<SaveOrLoadReturnType> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			"recent",
			async () => {
				const mostRecentSave = await this.#getMostRecentSave();

				if (mostRecentSave) {
					const loadResult = this.loadFromObject(mostRecentSave);

					if (!loadResult.success) {
						throw loadResult.err;
					}
				} else {
					throw Error("No recent save found");
				}
			},
		);
	}

	/** Loads the save data from the provided save data object.
	 *
	 * This is used to load saves from the `getSaves()` method.
	 *
	 * @param save The save data to load
	 */
	loadFromObject(
		save: (typeof this._type.exportData)["saveData"],
	): SaveOrLoadReturnType {
		const {
			data: { initialState, snapshots, storyIndex },
			meta: { version },
		} = save;

		const oldIndex = this.#index;
		const oldPassage = this.passage;

		const oldState = this.#shouldCloneOldState ? clone(this.vars) : this.vars;

		const { saveCompat: saveCompatibilityMode, saveVersion: engineVersion } =
			this.#config;

		const saveCompatibility = isSaveCompatibleWithEngine(
			version,
			engineVersion,
			saveCompatibilityMode,
		);

		switch (saveCompatibility) {
			case "compat": {
				// Replace the current state
				this.#initialState = initialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				break;
			}

			case "old": {
				// Temporarily replace the current state
				const originalInitialState = this.#initialState;
				const originalStateSnapshots = this.#stateSnapshots;
				const originalIndex = this.#index;

				this.#initialState = initialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				try {
					let migratedState: typeof this._type.state.complete | null = null;

					let currentSaveVersion = version;

					while (currentSaveVersion !== engineVersion) {
						const migratorData = this.#saveMigrationMap.get(currentSaveVersion);
						if (!migratorData) {
							const sanitisedErr = Error(
								`No migrator function found for save version ${currentSaveVersion}. Required to migrate to engine version ${engineVersion}.`,
							);

							this.#emitCustomEvent("migrationEnd", {
								error: sanitisedErr,
								fromVersion: currentSaveVersion,
								toVersion: engineVersion,
								type: "error",
							});

							this.#initialState = originalInitialState;
							this.#stateSnapshots = originalStateSnapshots;
							this.#index = originalIndex;

							return { err: sanitisedErr, success: false };
						}

						const { migrater, to } = migratorData;

						this.#emitCustomEvent("migrationStart", {
							fromVersion: currentSaveVersion,
							toVersion: to,
						});

						try {
							const currentStateToMigrate = migratedState ?? this.vars;
							migratedState = migrater(currentStateToMigrate);

							this.#emitCustomEvent("migrationEnd", {
								fromVersion: currentSaveVersion,
								toVersion: to,
								type: "success",
							});
						} catch (err) {
							const sanitisedErr = sanitiseError(err);

							this.#emitCustomEvent("migrationEnd", {
								error: sanitisedErr,
								fromVersion: currentSaveVersion,
								toVersion: to,
								type: "error",
							});

							return { err: sanitisedErr, success: false };
						}

						currentSaveVersion = to;
					}

					// Save migration completed successfully so rewrite the state with it
					if (migratedState) {
						this.#rewriteState(migratedState);

						break;
					}

					return {
						err: Error(
							`Save with version ${currentSaveVersion} returned null during migration`,
						),
						success: false,
					};
				} catch (e) {
					// Reset any changes since the migration failed
					this.#initialState = originalInitialState;
					this.#stateSnapshots = originalStateSnapshots;
					this.#index = originalIndex;

					// Rethrow
					throw sanitiseError(e);
				}
			}
			case "new": {
				return {
					err: Error(
						`Save with version ${version} is too new for the engine with version ${engineVersion}`,
					),
					success: false,
				};
			}
		}

		// Load plugin data from the engine state now that it has been refreshed.
		this.#loadAllPluginSerializableDataFromStoryState();

		// Clear the state cache since the state has changed
		this.#stateCache?.clear();

		if (oldIndex !== this.#index) {
			this.#emitCustomEvent("historyChange", {
				newIndex: this.#index,
				oldIndex,
			});
		}

		this.#emitCustomEvent("stateChange", { newState: this.vars, oldState });
		this.#emitCustomEvent("passageChange", {
			newPassage: this.passage,
			oldPassage,
		});

		return { data: void 0, success: true };
	}

	/** For exports that need to be stored or transferred outside the current engine instance */
	async saveToExport(): Promise<SaveOrLoadReturnType<string>> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			"export",
			async () => {
				const exportData: typeof this._type.exportData = {
					plugins: this.#collectPluginSerializableData(false),
					saveData: this.#buildSaveRecord(),
				};

				//@ts-expect-error Inference Limitation
				const stringifiedExportData = serialize(exportData);

				const finalDataToExport = await compressStringIfApplicable(
					stringifiedExportData,
					this.#config.compress,
				);

				return finalDataToExport;
			},
		);
	}

	/** Using the provided persistence adapter, this saves all vital data for the combined state, metadata, and current index
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 */
	async saveToSaveSlot(saveSlot?: number): Promise<SaveOrLoadReturnType> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			saveSlot,
			async () => {
				const { persistence, compress: canCompress } = this.#config;

				const saveMetaKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotMetaStorageKey(saveSlot)
						: this.#getAutoSaveMetaStorageKey();

				const saveDataKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotDataStorageKey(saveSlot)
						: this.#getAutoSaveDataStorageKey();

				const [dataToStore, metaToStore] = await Promise.all([
					compressStringIfApplicable(
						serialize(this.#buildSaveData()),
						canCompress,
					),
					compressStringIfApplicable(
						serialize(this.#buildSaveMetadata()),
						canCompress,
					),
				]);

				await Promise.all([
					persistence.set(saveDataKey, dataToStore),
					persistence.set(saveMetaKey, metaToStore),
				]);
			},
		);
	}

	/** Deletes any save data associated with the provided save slot.
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the save slot is invalid or if the persistence adapter is not available
	 */
	async deleteSaveSlot(saveSlot?: number): Promise<unknown> {
		const slot = saveSlot ?? "autosave";

		this.#emitCustomEvent("deleteStart", { slot });

		try {
			const saveMetaKey =
				typeof saveSlot === "number"
					? this.#getSaveSlotMetaStorageKey(saveSlot)
					: this.#getAutoSaveMetaStorageKey();

			const saveDataKey =
				typeof saveSlot === "number"
					? this.#getSaveSlotDataStorageKey(saveSlot)
					: this.#getAutoSaveDataStorageKey();

			const deleted = await Promise.all([
				this.#persistenceAdapter.delete(saveMetaKey),
				this.#persistenceAdapter.delete(saveDataKey),
			]);

			this.#emitCustomEvent("deleteEnd", { slot, type: "success" });

			return deleted;
		} catch (e) {
			const sanitisedError = sanitiseError(e);

			this.#emitCustomEvent("deleteEnd", {
				error: sanitisedError,
				slot,
				type: "error",
			});

			throw sanitisedError;
		}
	}

	async deleteAllSaveSlots(): Promise<unknown> {
		const deletePromises: Array<Promise<unknown>> = [];

		for await (const save of this.getSaves()) {
			if (save.type === "autosave") {
				deletePromises.push(this.deleteSaveSlot());
			} else {
				deletePromises.push(this.deleteSaveSlot(save.slot));
			}
		}

		return Promise.all(deletePromises);
	}

	// Events

	/** Subscribe to an event.
	 *
	 * @returns a function that can be used to unsubscribe from the event.
	 */
	on<TEventName extends keyof typeof this._type.events>(
		eventName: TEventName,
		listener: (payload: (typeof this._type.events)[TEventName]) => void,
	): () => void {
		return this.#eventEmitter.on(eventName, listener);
	}

	once<TEventName extends keyof typeof this._type.events>(
		eventName: TEventName,
		listener: (payload: (typeof this._type.events)[TEventName]) => void,
	): () => void {
		return this.#eventEmitter.once(eventName, listener);
	}

	/** Unsubscribe from an event */
	off<TEventName extends keyof typeof this._type.events>(
		eventName: TEventName,
		listener: (payload: (typeof this._type.events)[TEventName]) => void,
	): void {
		this.#eventEmitter.off(eventName, listener);
	}

	/** Any custom classes stored in the story's state must be registered with this */
	registerClasses(
		...customClasses: ChoicekitClassConstructorWithValidSerialization[]
	): void {
		customClasses.forEach(registerClass);
	}

	/** Use this to register custom callbacks for migrating outdated save data
	 *
	 * @throws if a migration for the same version already exists
	 */
	registerMigrators<
		TOldSaveStructure,
		TNewSaveStructure = TEngineGenerics["vars"],
	>(
		...migrators: {
			from: ChoicekitSemanticVersionString;
			data: ChoicekitSaveMigration<TOldSaveStructure, TNewSaveStructure>;
		}[]
	): void {
		for (const { from, data } of migrators) {
			const semanticVersionString = from;

			if (this.#saveMigrationMap.has(semanticVersionString)) {
				throw Error(
					`A migration for version ${from} already exists. Cannot register multiple migrations for the same version.`,
				);
			}

			this.#saveMigrationMap.set(semanticVersionString, data);
		}
	}

	// Lifecycle

	/** Clears all snapshot data and reverts to the initial state.
	 *
	 * Use this if you want the engine to essentially, start "afresh"
	 *
	 * @param [resetSeed=false] if true, the initial seed is randomised
	 */
	reset(resetSeed = false): void {
		this.#rewriteState(
			resetSeed
				? ({
						...this.#initialState,
						$$seed: getRandomInteger(),
					} as typeof this._type.state.complete)
				: ({ ...this.#initialState } as typeof this._type.state.complete),
		);

		this.#setIndex(0);

		this.#emitCustomEvent("engineReset", {
			newSeed: this.#currentStatePrngSeed,
		});
	}

	// Public getters (main API, read-only views)

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 *
	 * READONLY VERSION
	 */
	get index(): number {
		return this.#index;
	}

	/** Returns the passage data for the current state.
	 *
	 * If the passage does not exist, returns `null`.
	 */
	get passage(): typeof this._type.passage | null {
		return this.#passages.get(this.passageId) ?? null;
	}

	/** Returns the id to the appropriate passage for the current state */
	get passageId(): (typeof this._type.passage)["name"] {
		return this.vars.$$id;
	}

	/** Based off an internal PRNG, returns a random float between 0 and 1, inclusively */
	get random(): number {
		const { regenSeed } = this.#config;

		const prng = this.#currentStatePrng;

		// This will alter `prng.seed`
		const randomNumber = prng.nextBoundedInt(0, 1);

		if (regenSeed === "eachCall") {
			// Add the new seed to the snapshot on each call
			// @ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `$$seed` property
			this.#getSnapshotAtIndex(this.#index).$$seed = prng.seed;
		}

		return randomNumber;
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story. */
	get vars(): Readonly<typeof this._type.state.complete> {
		return this.#getStateAtIndex(this.#index);
	}

	// Private helpers: persistence keys and save discovery

	#assertSaveSlotIsValid(saveSlot: number): void {
		const { saveSlots: MAX_SAVE_SLOTS } = this.#config;

		const ERROR_TEXT = "Unable to save.";

		if (saveSlot < MINIMUM_SAVE_SLOT_INDEX || saveSlot >= MAX_SAVE_SLOTS) {
			throw Error(`${ERROR_TEXT} Save slot ${saveSlot} is invalid.`);
		}
	}

	// Some of these could be properties instead, but I like the consistency
	#getAutoSaveMetaStorageKey(): ChoicekitType.AutoSaveMetaKey {
		return `choicekit-${this.name}-autosave-meta`;
	}

	#getAutoSaveDataStorageKey(): ChoicekitType.AutoSaveDataKey {
		return `choicekit-${this.name}-autosave-data`;
	}

	#getPluginStorageKey(pluginId: string): ChoicekitType.PluginSaveKey {
		return `choicekit-${this.name}-plugin-${pluginId}` as const;
	}

	#getSaveSlotMetaStorageKey(
		saveSlot: number,
	): ChoicekitType.NormalSaveMetaKey {
		this.#assertSaveSlotIsValid(saveSlot);
		return `choicekit-${this.name}-slot${saveSlot}-meta` as const;
	}

	#getSaveSlotDataStorageKey(
		saveSlot: number,
	): ChoicekitType.NormalSaveDataKey {
		this.#assertSaveSlotIsValid(saveSlot);
		return `choicekit-${this.name}-slot${saveSlot}-data` as const;
	}

	async *#getMetaKeysOfPresentSaves(): AsyncGenerator<ChoicekitType.SaveMetaKey> {
		const persistence = this.#persistenceAdapter;

		const keys = await persistence.keys?.();

		const autosaveMetaKey = this.#getAutoSaveMetaStorageKey();

		const saveSlotMetaKeyPrefix = `choicekit-${this.name}-slot` as const;

		if (keys) {
			// Filter out keys that are not save metadata keys
			for (const key of keys) {
				if (
					key === autosaveMetaKey ||
					(key.startsWith(saveSlotMetaKeyPrefix) && key.endsWith("-meta"))
				) {
					//@ts-expect-error TS doesn't know that the key is a ChoicekitType.SaveMetaKey
					yield key;
				}
			}
		} else {
			// Fallback to using get() to get the keys
			if (await persistence.get(autosaveMetaKey)) {
				yield autosaveMetaKey;
			}

			for (let i = 0; i < this.#config.saveSlots; i++) {
				const key = this.#getSaveSlotMetaStorageKey(i);

				if (await persistence.get(key)) {
					yield key;
				}
			}
		}
	}

	async #getMostRecentSave(): Promise<
		(typeof this._type.exportData)["saveData"] | null
	> {
		let mostRecentSave: (typeof this._type.exportData)["saveData"] | null =
			null;

		for await (const { getData, meta } of this.getSaves()) {
			const data = await getData();
			const saveRecord: (typeof this._type.exportData)["saveData"] = {
				data,
				meta,
			};

			if (!mostRecentSave) {
				mostRecentSave = saveRecord;
			} else {
				if (meta.savedOn > mostRecentSave.meta.savedOn) {
					mostRecentSave = saveRecord;
				}
			}
		}

		return mostRecentSave;
	}

	#isPassageIdValid(passageId: string): boolean {
		return this.#passages.has(passageId);
	}

	// Private helpers: state history and snapshots

	#setIndex(val: number) {
		if (val < 0 || val >= this.#snapshotCount) {
			throw new RangeError("Index out of bounds");
		}

		const oldIndex = this.#index;
		const oldPassage = this.passage;

		const oldState = this.#shouldCloneOldState ? clone(this.vars) : this.vars;

		this.#index = val;

		// Keep withSave plugin state in sync when moving through history.
		this.#loadAllPluginSerializableDataFromStoryState();

		if (oldIndex !== this.#index) {
			this.#emitCustomEvent("historyChange", {
				newIndex: this.#index,
				oldIndex,
			});
		}

		this.#emitCustomEvent("passageChange", {
			newPassage: this.passage,
			oldPassage,
		});

		this.#emitCustomEvent("stateChange", {
			newState: this.#getStateAtIndex(this.#index),
			oldState,
		});
	}

	/** Creates a brand new empty state right after the current history's index and returns a reference to it
	 *
	 * This will replace any existing state at the current index + 1.
	 */
	#addNewSnapshot(): typeof this._type.state.snapshot {
		const { maxStates: maxStateCount, stateMergeCount } = this.#config;

		if (this.#snapshotCount >= maxStateCount) {
			// If the maximum number of states is reached, merge the last two snapshots
			this.#mergeSnapshots(0, stateMergeCount);
		}

		const indexForNewSnapshot = this.#index + 1;

		this.#stateSnapshots[indexForNewSnapshot] = {};

		return this.#getSnapshotAtIndex(indexForNewSnapshot);
	}

	get #snapshotCount(): number {
		return this.#stateSnapshots.length;
	}

	get #lastSnapshotIndex(): number {
		return this.#snapshotCount - 1;
	}

	/** Inclusively combines the snapshots within the given range of indexes to free up space.
	 *
	 * It also creates a new snapshot list to replace the old one.
	 */
	#mergeSnapshots(lowerIndex: number, upperIndex: number): void {
		const lastIndex = this.#lastSnapshotIndex;

		if (lastIndex < 1 || upperIndex < lowerIndex) return; // No snapshots to merge

		upperIndex = Math.min(upperIndex, lastIndex);

		const difference = upperIndex - lowerIndex;

		const indexesToMerge: ReadonlySet<number> = new Set(
			Array.from(Array(difference + 1), (_, i) => lowerIndex + i),
		);

		const combinedSnapshot: typeof this._type.state.snapshot = {};

		const newSnapshotArray: Array<typeof this._type.state.snapshot> = [];

		for (let i = 0; i < this.#snapshotCount; i++) {
			const currentSnapshot = this.#getSnapshotAtIndex(i);

			// Merge the snapshot at this index into the combined snapshot
			if (indexesToMerge.has(i)) {
				let key: keyof typeof this._type.state.snapshot;

				for (key in currentSnapshot) {
					const value = currentSnapshot[key];

					if (value !== undefined) {
						combinedSnapshot[key] = value;
					}
				}

				// If this is the last snapshot in the range, add the combined snapshot
				if (i === upperIndex) {
					newSnapshotArray.push(combinedSnapshot);
				}
			} else {
				// Keep the snapshot as is
				newSnapshotArray.push(currentSnapshot);
			}
		}

		this.#stateSnapshots = newSnapshotArray;

		// Since the index will be pointing to an undefined snapshot after merging, we need to set it back to the last valid index
		this.#index = this.#index - difference;

		this.#stateCache?.clear();
	}

	/**
	 *
	 * @throws a `RangeError` if the given index does not exist
	 */
	#getSnapshotAtIndex(index: number): typeof this._type.state.snapshot {
		const possibleSnapshot = this.#stateSnapshots[index];

		if (!possibleSnapshot) throw new RangeError("Snapshot index out of bounds");

		return possibleSnapshot;
	}

	/**
	 *
	 * @param index - The index at which the state will be calculated. Defaults to the most recent snapshot's index
	 * @returns
	 */
	#getStateAtIndex(
		index: number = this.#lastSnapshotIndex,
	): Readonly<typeof this._type.state.complete> {
		const stateLength = this.#snapshotCount;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this.#stateCache?.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = clone(this.#initialState) as typeof this._type.state.complete;

		for (let i = 0; i <= effectiveIndex; i++) {
			let partialUpdateKey: keyof TEngineGenerics["vars"];

			const partialUpdate: typeof this._type.state.snapshot =
				this.#getSnapshotAtIndex(i);

			for (partialUpdateKey in partialUpdate) {
				const partialUpdateData = partialUpdate[partialUpdateKey];

				// Ignore only undefined values
				if (partialUpdateData !== undefined) {
					state[partialUpdateKey] = partialUpdateData;
				}
			}
		}

		// Cache the state for future use
		this.#stateCache?.set(effectiveIndex, state);

		return state;
	}

	/** **WARNING:** This will **replace** the initialState and **empty** all the snapshots. */
	#rewriteState(
		stateToReplaceTheCurrentOne: Readonly<typeof this._type.state.complete>,
	): void {
		this.#initialState = stateToReplaceTheCurrentOne;

		this.#stateSnapshots = this.#stateSnapshots.map((_) => ({}));

		this.#stateCache?.clear();
	}

	// Private helpers: event emission

	#emitCustomEvent<TEventType extends keyof typeof this._type.events>(
		name: TEventType,
		data: (typeof this._type.events)[TEventType],
	): void {
		this.#eventEmitter.emit(name, data);

		const { autoSave } = this.#config;

		switch (name) {
			case "passageChange": {
				if (autoSave === "passage") {
					this.saveToSaveSlot();
				}
				break;
			}

			case "stateChange": {
				if (autoSave === "state") {
					this.saveToSaveSlot();
				}
			}
		}
	}

	async #emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback<
		TCallBackReturnValue,
	>(
		operation: "save" | "load",
		saveSlot: number | "autosave" | "export" | "recent" | undefined,
		callback: () => Promise<TCallBackReturnValue>,
	): Promise<SaveOrLoadReturnType<TCallBackReturnValue>> {
		const slot = saveSlot ?? "autosave";

		this.#emitCustomEvent(operation === "save" ? "saveStart" : "loadStart", {
			slot,
		});

		const endEvent = operation === "save" ? "saveEnd" : "loadEnd";

		try {
			const result = await callback();

			this.#emitCustomEvent(endEvent, {
				slot,
				type: "success",
			});

			return { data: result, success: true };
		} catch (e) {
			const sanitisedErr = sanitiseError(e);

			this.#emitCustomEvent(endEvent, {
				error: sanitisedErr,
				slot,
				type: "error",
			});

			return { err: sanitisedErr, success: false };
		}
	}

	// Private helpers: plugin state and serialization

	#assertPluginExists(pluginId: string): ChoicekitPlugin {
		const plugin = this.#plugins.get(pluginId);

		if (!plugin) throw Error(`Plugin ''${pluginId}'' has not been mounted.`);

		return plugin;
	}

	#assertPluginState(pluginId: string): GenericObject {
		const state = this.#pluginState.get(pluginId);

		if (state) return state;

		// In `#usePlugin`, plugin state should be initialized, even if to an empty object, so if it doesn't exist at this point, it's a sign that something went wrong during initialization
		throw Error(
			`State for plugin ''${pluginId}'' does not exist. Did it initialize properly?`,
		);
	}

	#stringifyPluginConfig(config: GenericObject): string {
		try {
			return JSON.stringify(config);
		} catch {
			return "[unserializable config]";
		}
	}

	#resolveDependencyConfig(
		dependencyConfig:
			| GenericObject
			| ChoicekitDependencyConfigResolver<
					GenericObject,
					GenericObject | undefined
			  >
			| undefined,
		callerPluginConfig: GenericObject,
	): GenericObject {
		return (
			(dependencyConfig instanceof Function
				? dependencyConfig(callerPluginConfig)
				: dependencyConfig) ?? {}
		);
	}

	/** This only makes sense if the plugin state should be stored along story saves / snapshots, since otherwise it would be wasteful to serialize plugin state in snapshots that aren't meant to be stored in saves.
	 *
	 * If the plugin doesn't have serializable data or if `withSave` is false, this does nothing.
	 *
	 * @param pluginId
	 * @param index
	 * @returns
	 */
	#persistPluginSerializableDataInSnapshot(
		pluginId: string,
		index = this.#index,
	): void {
		const { serialize, version } = this.#assertPluginExists(pluginId);

		if (!serialize?.withSave) return;

		const { method } = serialize;

		const snapshot = this.#getSnapshotAtIndex(index);

		if (!snapshot.$$plugins) {
			//@ts-expect-error - Inference Limitation
			snapshot.$$plugins = new Map();
		}

		const data: ChoicekitPluginSaveStructure = {
			data: method(this.#assertPluginState(pluginId)),
			version,
		};

		// When using an actual imutable lib, only store the patch instead of a new copy.
		snapshot.$$plugins.set(pluginId, data);
	}

	/** Loops through all plugins and stores their serializable data (if they have any) in the snapshot at the provided index. This is useful for keeping plugin state up to date in the snapshot history, which allows for things like rewinding time while keeping plugin state consistent.
	 *
	 * NOTE: This will only store plugin data for plugins that have `withSave` set to true, since otherwise it would be wasteful to store plugin data in snapshots that aren't meant to be stored in saves.
	 *
	 * @param index
	 */
	#persistAllPluginSerializableDataInSnapshot(index = this.#index): void {
		for (const [pluginId] of this.#plugins) {
			this.#persistPluginSerializableDataInSnapshot(pluginId, index);
		}
	}

	/** Using a record of serialized plugin save data, loads the mounted plugins with the save data in parallel
	 *
	 * @throws if the any plugin throws
	 */
	#loadAllPluginSerializableDataFromRecord(
		pluginSaveData: Map<string, ChoicekitPluginSaveStructure>,
	): void {
		for (const [pluginId, { data, version }] of pluginSaveData) {
			const mountedPlugin = this.#assertPluginExists(pluginId);

			mountedPlugin.onDeserialize?.({
				data,
				state: this.#assertPluginState(pluginId),
				version,
			});
		}
	}

	/** Only useful for plugins that shouldn't store their state with story data */
	async #savePluginDataToStoragePartition(pluginId: string): Promise<void> {
		const plugin = this.#assertPluginExists(pluginId);
		const pluginState = this.#assertPluginState(pluginId);

		const { method, withSave } = plugin.serialize ?? {};
		const { version } = plugin;

		if (!method || withSave == null || withSave === true) {
			return;
		}

		const serializableState: TransformableOrJsonSerializableType = {
			data: await method(pluginState),
			version,
		};

		const key = this.#getPluginStorageKey(pluginId);

		await this.#persistenceAdapter.set(key, serialize(serializableState));
	}

	async #loadPluginDataFromStoragePartition(pluginId: string): Promise<void> {
		const plugin = this.#assertPluginExists(pluginId);

		const storageKey = this.#getPluginStorageKey(pluginId);
		const stringifiedData = await this.#persistenceAdapter.get(storageKey);

		if (!stringifiedData) return;

		const { data, version }: ChoicekitPluginSaveStructure = v.parse(
			ChoicekitPluginSaveStructureSchema,
			deserialize(stringifiedData),
		);

		plugin.onDeserialize?.({
			data,
			state: this.#assertPluginState(pluginId),
			version,
		});
	}

	#loadPluginSerializableDataFromStoryState(pluginId: string): void {
		const plugin = this.#assertPluginExists(pluginId);
		const serializedPluginState = this.vars.$$plugins?.get(pluginId);

		if (!serializedPluginState) return;

		const { data, version } = serializedPluginState;

		plugin.onDeserialize?.({
			data,
			state: this.#assertPluginState(pluginId),
			version,
		});
	}

	#loadAllPluginSerializableDataFromStoryState(): void {
		for (const [pluginId] of this.#plugins) {
			this.#loadPluginSerializableDataFromStoryState(pluginId);
		}
	}

	get #currentStatePrngSeed(): number {
		return this.vars.$$seed;
	}

	/** Since the seed is stored in each snapshot and reinitializing the class isn't expensive, there's not much use in having a dedicated prng prop */
	#getPrngFromSeed(seed: number): PRNG {
		return new PRNG(seed);
	}

	get #currentStatePrng(): PRNG {
		return this.#getPrngFromSeed(this.#currentStatePrngSeed);
	}

	get #shouldCloneOldState(): boolean {
		return this.#config.emitMode !== "perf";
	}

	get #persistenceAdapter() {
		return this.#config.persistence;
	}

	#buildSaveData(): typeof this._type.saveData {
		// Make sure all plugin data is up to date in the snapshot before saving
		this.#persistAllPluginSerializableDataInSnapshot();

		return {
			initialState: this.#initialState as typeof this._type.state.complete,
			snapshots: this.#stateSnapshots,
			storyIndex: this.#index,
		};
	}

	#buildSaveMetadata(): ChoicekitType.SaveMetadata {
		return {
			lastPassageId: this.passageId,
			savedOn: new Date(),
			version: this.#config.saveVersion,
		};
	}

	#buildSaveRecord(): (typeof this._type.exportData)["saveData"] {
		return {
			data: this.#buildSaveData(),
			meta: this.#buildSaveMetadata(),
		};
	}

	/** Mounts and initializes a plugin */
	async #usePlugin(
		pluginToUse: ChoicekitPlugin,
		config?: GenericObject,
	): Promise<void> {
		const {
			id,
			initApi,
			initState,
			onOverride,
			dependencies = [],
			serialize: { withSave } = {},
		} = pluginToUse;

		const activePluginUsingNameSpace: ChoicekitPlugin | undefined =
			//@ts-expect-error Inference Limitation
			this.$[id];

		const isNamespaceUsed = !!activePluginUsingNameSpace;

		const applyPlugin = async () => {
			const engine = this;
			const normalizedPluginConfig = config ?? {};

			engine.#plugins.set(id, pluginToUse);
			engine.#pluginConfig.set(id, normalizedPluginConfig);

			for (const {
				config: depConfigInput,
				plugin: depPlugin,
			} of dependencies) {
				const resolvedDepConfig = engine.#resolveDependencyConfig(
					depConfigInput,
					normalizedPluginConfig,
				);

				const previousDependencyConfig = engine.#pluginConfig.get(depPlugin.id);

				if (previousDependencyConfig) {
					console.warn(
						`Dependency '${depPlugin.id}' was already mounted with config ${engine.#stringifyPluginConfig(previousDependencyConfig)}. Ignoring later config ${engine.#stringifyPluginConfig(resolvedDepConfig)} from '${id}'.`,
					);
				}

				try {
					await engine.#usePlugin(depPlugin, resolvedDepConfig);
				} catch {
					console.warn(
						`Plugin ${depPlugin.id} could not be mounted, perhaps it was already mounted?`,
					);
				}
			}

			const initialPluginState = (await initState?.()) ?? {};
			this.#pluginState.set(id, initialPluginState);

			const mutations =
				(await initApi?.({
					config,
					engine,
					state: initialPluginState,
					async triggerSave() {
						if (withSave === null) return;

						withSave
							? engine.#persistPluginSerializableDataInSnapshot(id)
							: await engine.#savePluginDataToStoragePartition(id);
					},
				})) ?? {};

			//@ts-expect-error Type schenanigans
			engine.$[id] = mutations;

			// Load plugin data from its storage partition (withSave: false) or the story state (withSave: true)
			withSave
				? engine.#loadPluginSerializableDataFromStoryState(id)
				: await engine.#loadPluginDataFromStoragePartition(id);

			return engine;
		};

		switch (onOverride) {
			case "err":
				if (isNamespaceUsed)
					throw Error(
						`Plugin namespace '${id}' is already used by ${JSON.stringify(activePluginUsingNameSpace)}. Cannot mount plugin ${JSON.stringify(pluginToUse)}`,
					);
				else await applyPlugin();
				break;
			case "ignore":
				if (isNamespaceUsed) {
					console.warn(
						`Plugin ${JSON.stringify(activePluginUsingNameSpace)} tried to override plugin ${JSON.stringify(pluginToUse)} on namespace ${id}, but it was ignored.`,
					);
					//@ts-expect-error Type narrowing for this in conditional return type
					return this;
				} else await applyPlugin();
				break;
			case "override": {
				if (isNamespaceUsed) {
					console.warn(
						`Plugin ${JSON.stringify(activePluginUsingNameSpace)} has overriden plugin ${JSON.stringify(pluginToUse)} on namespace ${id}`,
					);
				}
				await applyPlugin();
				break;
			}

			default:
				throw Error("Shouldn't be here.");
		}
	}

	/** Returns the serializable data for a single plugin, if any */
	#getSinglePluginSerializableData(
		pluginId: string,
	): [getSave: () => ChoicekitPluginSaveStructure, withSave: boolean] | null {
		const { serialize, version } = this.#assertPluginExists(pluginId);

		if (!serialize) return null;

		const { method, withSave } = serialize;

		return [
			() => ({
				data: method(this.#assertPluginState(pluginId)),
				version,
			}),
			withSave,
		];
	}

	/** Plugin save data that should be stored with saves or outside of saves */
	#collectPluginSerializableData(
		shouldBeBoundToSave: boolean,
	): Map<string, ChoicekitPluginSaveStructure> {
		const saveData = new Map<string, ChoicekitPluginSaveStructure>();

		for (const [pluginId] of this.#plugins) {
			const serializableData = this.#getSinglePluginSerializableData(pluginId);

			if (!serializableData) continue;

			const [getSave, withSave] = serializableData;

			switch (shouldBeBoundToSave) {
				case true:
					if (!withSave) continue;
					break;
				case false:
					if (withSave) continue;
					break;
			}

			const saveStructure = getSave();

			saveData.set(pluginId, saveStructure);
		}

		return saveData;
	}
}

const sanitiseError = (possibleError: unknown) =>
	possibleError instanceof Error ? possibleError : Error(String(possibleError));

const getRandomInteger = () => Math.floor(Math.random() * 2 ** 32);

export { ChoicekitEngine };
