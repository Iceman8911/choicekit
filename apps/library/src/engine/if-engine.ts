// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import { PRNG } from "@iceman8911/tiny-prng";
import {
	clone,
	deserialize,
	registerClass,
	type SugarboxClassConstructorWithValidSerialization,
	serialize,
} from "@packages/serializer";
import {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
} from "@packages/string-compression";
import type { Promisable } from "type-fest";
import type { SugarBoxCacheAdapter } from "../models/adapters";
import type {
	SugarBoxAutoSaveKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxNormalSaveKey,
	SugarBoxPluginSaveKey,
	SugarBoxSaveData,
	SugarBoxSaveKey,
	SugarBoxSnapshotMetadata,
} from "../models/if-engine";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../models/shared";
import type {
	SugarboxPlugin,
	SugarboxPluginSaveStructure,
} from "../plugins/plugin";
import { InMemoryPersistenceAdapter } from "../utils/persistence-adapters/in-memory";
import {
	isSaveCompatibleWithEngine,
	type SugarBoxSemanticVersionString,
} from "../utils/version";
import type {
	SugarBoxEngineArguments,
	SugarBoxEngineGenerics,
	SugarBoxSaveMigration,
	SugarBoxSaveMigrationMap,
} from "./_shared";

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
} as const satisfies SugarBoxConfig;

const MINIMUM_SAVE_SLOT_INDEX = 0;

const MINIMUM_SAVE_SLOTS = 1;

const SAVE_SLOT_NUMBER_REGEX = /slot(\d+)/;

type StateWithMetadata<TVariables extends GenericSerializableObject> =
	TVariables & SugarBoxSnapshotMetadata;

type SnapshotWithMetadata<TVariables extends GenericSerializableObject> =
	Partial<TVariables & SugarBoxSnapshotMetadata>;

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

/** Events fired from a `SugarBoxEngine` instance */
type SugarBoxEvents<TPassageData, TStateVariables> = {
	":passageChange": Readonly<{
		oldPassage: TPassageData | null;
		newPassage: TPassageData | null;
	}>;

	":stateChange": Readonly<{
		oldState: TStateVariables;
		newState: TStateVariables;
	}>;

	// ":init": null;

	":saveStart": SaveStartEvent;

	":saveEnd": SaveEndEvent;

	":loadStart": SaveStartEvent;

	":loadEnd": SaveEndEvent;

	":deleteStart": DeleteStartEvent;

	":deleteEnd": DeleteEndEvent;

	":migrationStart": Readonly<{
		fromVersion: SugarBoxSemanticVersionString;
		toVersion: SugarBoxSemanticVersionString;
	}>;

	":migrationEnd": Readonly<
		| {
				type: "success";
				fromVersion: SugarBoxSemanticVersionString;
				toVersion: SugarBoxSemanticVersionString;
		  }
		| {
				type: "error";
				fromVersion: SugarBoxSemanticVersionString;
				toVersion: SugarBoxSemanticVersionString;
				error: Error;
		  }
	>;
};

// type ApplyPluginsToEngineType<
// 	TEngine extends SugarboxEngine,
// 	TPlugins extends SugarBoxEngineGenerics["plugins"],
// > =
// 	TEngine extends SugarboxEngine<infer REngineGenerics>
// 		? SugarboxEngine<
// 				REngineGenerics & {
// 					plugins: REngineGenerics["plugins"] & {
// 						[KPlugin in TPlugins[number] as KPlugin extends AnySugarboxPlugin
// 							? KPlugin["id"]
// 							: never]: KPlugin;
// 					};
// 				}
// 			>
// 		: never;

type MapPluginsToApi<TPlugins extends SugarBoxEngineGenerics["plugins"]> = {
	[KPlugin in TPlugins[number] as KPlugin extends SugarboxPlugin
		? KPlugin["id"]
		: never]: "initApi" extends keyof KPlugin
		? KPlugin["initApi"] extends (...args: any) => any
			? Awaited<ReturnType<KPlugin["initApi"]>>
			: never
		: never;
};

/** The main engine for Sugarbox that provides headless interface to basic utilities required for Interactive Fiction
 *
 * Dispatches custom events that can be listened to with "addEventListener"
 */
class SugarboxEngine<
	const TEngineGenerics extends SugarBoxEngineGenerics = SugarBoxEngineGenerics,
> {
	/** Must be unique to prevent conflicts */
	readonly name: TEngineGenerics["name"];

	//@ts-expect-error Inference Limitation
	$: MapPluginsToApi<TEngineGenerics["plugins"]> = {};

	private declare _type: {
		engine: SugarboxEngine<TEngineGenerics>;
		passage: TEngineGenerics["passages"];
		config: SugarBoxConfig<TEngineGenerics["vars"], TEngineGenerics["plugins"]>;
		state: {
			complete: StateWithMetadata<TEngineGenerics["vars"]>;
			snapshot: SnapshotWithMetadata<TEngineGenerics["vars"]>;
		};
		saveData: SugarBoxSaveData<TEngineGenerics["vars"]>;
		exportData: SugarBoxExportData<TEngineGenerics["vars"]>;
		adapter: {
			cache: SugarBoxCacheAdapter<TEngineGenerics["vars"]>;
		};
		events: SugarBoxEvents<
			TEngineGenerics["passages"],
			TEngineGenerics["vars"]
		>;
	};

	#config!: typeof this._type.config;

	#eventTarget = new EventTarget();

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 */
	#index!: number;

	/**  Contains the structure of stateful variables in the engine.
	 *
	 * Will not be modified after initialization.
	 */
	#initialState!: Readonly<typeof this._type.state.complete>;

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
	#saveMigrationMap: SugarBoxSaveMigrationMap<any, any> = new Map();

	/** Since recalculating the current state can be expensive */
	#stateCache?: typeof this._type.adapter.cache;

	/** Contains partial updates to the state as a result of moving forwards in the story.
	 *
	 * This is also the "state history"
	 */
	#stateSnapshots!: Array<typeof this._type.state.snapshot>;

	#plugins: Record<string, SugarboxPlugin> = {};
	#pluginState: Record<string, GenericObject> = {};

	private constructor(
		/** Must be unique to prevent conflicts */
		name: string,
	) {
		this.name = name;
	}

	static async init<const TGenerics extends SugarBoxEngineGenerics>(
		args: Partial<SugarBoxEngineArguments<TGenerics>>,
	): Promise<SugarboxEngine<TGenerics>> {
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
		} as SugarBoxConfig<TGenerics["vars"]>;

		mergedConfig.initialSeed ??= getRandomInteger();

		const { cache, saveSlots, initialSeed } = mergedConfig;

		const engine = new SugarboxEngine(name);
		engine.#config = mergedConfig;

		// Perform the initialization that used to live in the constructor.
		// This keeps the private constructor dumb and centralizes setup here.
		engine.#stateSnapshots = [{}];
		engine.#index = 0;

		if (saveSlots && saveSlots < MINIMUM_SAVE_SLOTS)
			throw Error(`Invalid number of save slots: ${saveSlots}`);

		// Add passages and set cache if provided
		engine.addPassages(...passages);

		if (cache) {
			engine.#stateCache = cache;
		}

		const isInitialStateCallback = vars instanceof Function;

		/** Initialize the state with the provided initial state or an empty object if the initial state is a callback. This is to prevent circular dependencies that depend on the private variable */
		engine.#initialState = {
			...(isInitialStateCallback ? ({} as TGenerics["vars"]) : vars),
			$$id: passages[0].name,
			$$seed: initialSeed,
		} as Readonly<StateWithMetadata<TGenerics["vars"]>>;

		// If the initial state is a function, call it with the engine instance
		if (isInitialStateCallback) {
			// `vars` is typed as possibly a callback; call it with the engine instance
			engine.#initialState = {
				...vars({ prng: engine.random }),
				$$id: passages[0].name,
				$$seed: initialSeed,
			} as Readonly<StateWithMetadata<TGenerics["vars"]>>;
		}

		engine.registerClasses(...(classes ?? []));

		engine.registerMigrators(...(migrations ?? []));

		// Mount plugins that were provided during initialization (if any).
		const initPlugins = args.plugins ?? [];
		for (const entry of initPlugins) {
			const { plugin: pluginToUse, config: pluginConfig } = entry;

			await engine.#usePlugin(pluginToUse, pluginConfig);
		}

		const { loadOnStart } = config;

		// Also load the most recent save if `loadOnStart` is true
		await Promise.allSettled([
			engine.#loadPluginSaveDataFromStorageArea(),
			loadOnStart ? engine.loadRecentSave() : "",
		]);

		return engine;
	}

	// Public methods (main API of the class)

	/** Immer-style way of updating story variables
	 *
	 * Use this **solely** for setting values. If you must read a value, use `this.vars`
	 *
	 * **If you need to replace the entire state, *return a new object* instead of directly *assigning the value***
	 *
	 * @param [emitEvent=true] If true, a ":stateChange" event will be emitted. Set this to false if you use it within a `:stateChange` listener
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

						//@ts-expect-error TS is confused
						target[prop] = clone(previousStateValue);
					}
				}

				return Reflect.get(target, prop, receiver);
			},
		});

		const possibleValueToUseForReplacing = producer(proxy);

		if (possibleValueToUseForReplacing) {
			this.#rewriteState({
				...possibleValueToUseForReplacing,
				$$id: this.passageId,
				$$seed: this.#currentStatePrngSeed,
			});
		}

		// Clear the cache entry for this since it has been changed
		self.#stateCache?.delete(self.#index);

		const newState = self.#getStateAtIndex(self.#index);

		if (emitEvent) {
			self.#emitCustomEvent(":stateChange", {
				newState,
				oldState,
			});
		}
	}

	/** Adds a new passage to the engine.
	 *
	 * The passage id should be unique, and the data can be anything that you want to store for the passage.
	 *
	 * If the passage already exists, it will be overwritten.
	 */
	addPassage(passageData: typeof this._type.passage): void {
		this.#passages.set(passageData.name, passageData);
	}

	/** Like `addPassage`, but takes in a collection */
	addPassages(...passageData: ReadonlyArray<typeof this._type.passage>): void {
		for (const passageDatum of passageData) {
			this.addPassage(passageDatum);
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

	async deleteAllSaveSlots(): Promise<unknown> {
		const deletePromises: Array<Promise<unknown>> = [];

		for await (const save of this.getSaves()) {
			if (save.type === "autosave") {
				deletePromises.push(this.deleteSaveSlot());
			} else {
				deletePromises.push(this.deleteSaveSlot(save.slot));
			}
		}

		return Promise.allSettled(deletePromises);
	}

	/** Deletes any save data associated with the provided save slot.
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the save slot is invalid or if the persistence adapter is not available
	 */
	async deleteSaveSlot(saveSlot?: number): Promise<unknown> {
		const slot = saveSlot ?? "autosave";

		this.#emitCustomEvent(":deleteStart", { slot });

		try {
			const saveSlotKey =
				typeof saveSlot === "number"
					? this.#getSaveSlotStorageKey(saveSlot)
					: this.#getAutoSaveStorageKey();

			const deleted = await this.#persistenceAdapter.delete(saveSlotKey);

			this.#emitCustomEvent(":deleteEnd", { slot, type: "success" });

			return deleted;
		} catch (e) {
			const sanitizedError = sanitiseError(e);

			this.#emitCustomEvent(":deleteEnd", {
				error: sanitizedError,
				slot,
				type: "error",
			});

			throw sanitizedError;
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

	/** Returns an object containing the data of all present saves */
	async *getSaves(): AsyncGenerator<
		| { type: "autosave"; data: SugarBoxSaveData<TEngineGenerics["vars"]> }
		| {
				type: "normal";
				slot: number;
				data: SugarBoxSaveData<TEngineGenerics["vars"]>;
		  }
	> {
		for await (const key of this.#getKeysOfPresentSaves()) {
			const serializedSaveData = await this.#persistenceAdapter.get(key);

			if (!serializedSaveData) continue;

			//@ts-expect-error Inference Limitation
			const saveData: typeof this._type.saveData = deserialize(
				await decompressPossiblyCompressedJsonString(serializedSaveData),
			) as typeof this._type.saveData;

			if (key === this.#getAutoSaveStorageKey()) {
				yield { data: saveData, type: "autosave" };
			} else {
				const slotNumber = Number(key.match(SAVE_SLOT_NUMBER_REGEX)?.[1] ?? -1);

				yield { data: saveData, slot: slotNumber, type: "normal" };
			}
		}
	}

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
		const matchedPasages: (typeof this._type.passage)[] = [];

		const doesMatchPassageDataTags = (
			tag: TEngineGenerics["passages"]["tags"][number],
			passageData: typeof this._type.passage,
		) => !!passageData.tags?.includes(tag);

		const { type, tags } = query;

		for (const [_, passageData] of this.#passages) {
			if (type === "any") {
				if (tags.some((tag) => doesMatchPassageDataTags(tag, passageData))) {
					matchedPasages.push(passageData);
				}
			} else {
				if (tags.every((tag) => doesMatchPassageDataTags(tag, passageData))) {
					matchedPasages.push(passageData);
				}
			}
		}

		return matchedPasages;
	}

	/** Gets all the times the passage has been visited by looping through each snapshot and initial state.
	 *
	 * Use this in place of `hasVisited(id)`, i.e `getVisitCount(id) > 0`
	 *
	 * @param [passageId=this.passageId]
	 *
	 * TODO: benchmark this later to see if caching will be beneficial
	 */
	getVisitCount(passageId: string = this.passageId): number {
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

	/** Can be used when directly loading a save from an exported save on disk
	 *
	 * @throws if the save was made on a later version than the engine or if a save migration throws
	 */
	async loadFromExport(data: string): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			"export",
			async () => {
				const jsonString = await decompressPossiblyCompressedJsonString(data);

				//@ts-expect-error Inference Limitation
				const { saveData, plugins }: typeof this._type.exportData =
					deserialize(jsonString);

				await this.#loadPluginSaveDataFromRecord(plugins);

				// Replace the current state
				await this.loadSaveFromData(saveData);
			},
		);
	}

	/**
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the save slot is invalid or if the persistence adapter is not available
	 */
	async loadFromSaveSlot(saveSlot?: number): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			saveSlot,
			async () => {
				const saveSlotKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotStorageKey(saveSlot)
						: this.#getAutoSaveStorageKey();

				const serializedSaveData =
					await this.#persistenceAdapter.get(saveSlotKey);

				if (!serializedSaveData) {
					throw Error(`No save data found for slot ${saveSlot}`);
				}

				const jsonString =
					await decompressPossiblyCompressedJsonString(serializedSaveData);

				await this.loadSaveFromData(
					//@ts-expect-error Inference Limitation
					deserialize(jsonString) as typeof this._type.saveData,
				);
			},
		);
	}

	/** Loads the most recent save, if any. Doesn't throw */
	async loadRecentSave(): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			"recent",
			async () => {
				const mostRecentSave = await this.#getMostRecentSave();

				if (mostRecentSave) await this.loadSaveFromData(mostRecentSave);
			},
		);
	}

	/** Loads the save data from the provided save data object.
	 *
	 * This is used to load saves from the `getSaves()` method.
	 *
	 * @param save The save data to load
	 *
	 * @throws if the save was made on a later version than the engine or if a save migration throws
	 */
	async loadSaveFromData(save: typeof this._type.saveData): Promise<void> {
		const { intialState, snapshots, storyIndex, saveVersion, plugins } = save;

		await this.#loadPluginSaveDataFromRecord(plugins);

		const oldPassage = this.passage;

		const oldState = this.#shouldCloneOldState ? clone(this.vars) : this.vars;

		const { saveCompat: saveCompatibilityMode, saveVersion: engineVersion } =
			this.#config;

		const saveCompatibility = isSaveCompatibleWithEngine(
			saveVersion,
			engineVersion,
			saveCompatibilityMode,
		);

		switch (saveCompatibility) {
			case "compat": {
				// Replace the current state
				this.#initialState = intialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				break;
			}

			case "old": {
				// Temporarily replace the current state
				const originalInitialState = this.#initialState;
				const originalStateSnapshots = this.#stateSnapshots;
				const originalIndex = this.#index;

				this.#initialState = intialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				try {
					let migratedState: typeof this._type.state.complete | null = null;

					let currentSaveVersion = saveVersion;

					while (currentSaveVersion !== engineVersion) {
						const migratorData = this.#saveMigrationMap.get(currentSaveVersion);
						if (!migratorData) {
							throw Error(
								`No migrator function found for save version ${currentSaveVersion}. Required to migrate to engine version ${engineVersion}.`,
							);
						}

						const { migrater, to } = migratorData;

						this.#emitCustomEvent(":migrationStart", {
							fromVersion: currentSaveVersion,
							toVersion: to,
						});

						try {
							const currentStateToMigrate = migratedState ?? this.vars;
							migratedState = migrater(currentStateToMigrate);

							this.#emitCustomEvent(":migrationEnd", {
								fromVersion: currentSaveVersion,
								toVersion: to,
								type: "success",
							});
						} catch (error) {
							this.#emitCustomEvent(":migrationEnd", {
								error: sanitiseError(error),
								fromVersion: currentSaveVersion,
								toVersion: to,
								type: "error",
							});
							throw error;
						}

						currentSaveVersion = to;
					}

					// Save migration completed successfully so rewrite the state with it
					if (migratedState) {
						this.#rewriteState(migratedState);

						break;
					}

					throw Error(
						`Save with version ${currentSaveVersion} returned null during migration`,
					);
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
				throw Error(
					`Save with version ${saveVersion} is too new for the engine with version ${engineVersion}`,
				);
			}
		}

		// Clear the state cache since the state has changed
		this.#stateCache?.clear();

		this.#emitCustomEvent(":stateChange", { newState: this.vars, oldState });
		this.#emitCustomEvent(":passageChange", {
			newPassage: this.passage,
			oldPassage,
		});
	}

	/** Using a record of serialized plugin save data, loads the mounted plugins with the save data in parallel
	 *
	 * @throws if the any plugin throws
	 */
	async #loadPluginSaveDataFromRecord(
		pluginSaveData: Record<string, SugarboxPluginSaveStructure>,
	): Promise<void> {
		const loadingPromises: Promisable<void>[] = [];

		for (const pluginId in pluginSaveData) {
			const mountedPlugin = this.#plugins[pluginId];

			if (!mountedPlugin) continue;

			const { data, version } = pluginSaveData[pluginId]!;

			loadingPromises.push(
				mountedPlugin.onDeserialize?.({
					data,
					state: this.#pluginState[pluginId]!,
					version,
				}),
			);
		}

		await Promise.all(loadingPromises);
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
		passageId: string = this.passageId,
	): typeof this._type.state.snapshot {
		if (!this.#isPassageIdValid(passageId))
			throw Error(
				`Cannot navigate: Passage with ID '${passageId}' not found. Add it using addPassage().`,
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

	/** Subscribe to an event.
	 *
	 * @returns a function that can be used to unsubscribe from the event.
	 */
	on<TEventType extends keyof typeof this._type.events>(
		type: TEventType,
		listener: (
			event: CustomEvent<(typeof this._type.events)[TEventType]>,
		) => void,
		options?: boolean | AddEventListenerOptions,
	): () => void {
		//@ts-expect-error TS doesn't know that the custom event will exist at runtime
		this.#eventTarget.addEventListener(type, listener, options);

		return () => {
			this.off(type, listener, options);
		};
	}

	/** Unsubscribe from an event */
	off<TEventType extends keyof typeof this._type.events>(
		type: TEventType,
		listener:
			| ((event: CustomEvent<(typeof this._type.events)[TEventType]>) => void)
			| null,
		options?: boolean | AddEventListenerOptions,
	): void {
		//@ts-expect-error TS doesn't know that the custom event will exist at runtime
		this.#eventTarget.removeEventListener(type, listener, options);
	}

	/** Any custom classes stored in the story's state must be registered with this */
	registerClasses(
		...customClasses: SugarboxClassConstructorWithValidSerialization[]
	): void {
		customClasses.forEach((customClass) => {
			registerClass(customClass);
		});
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
			from: SugarBoxSemanticVersionString;
			data: SugarBoxSaveMigration<TOldSaveStructure, TNewSaveStructure>;
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

	/** Clears all snapshot data and reverts to the initial state.
	 *
	 * Use this if you want the engine to essentially, start "afresh"
	 *
	 * @param [resetSeed=false] if true, the initial seed is randomised
	 */
	reset(resetSeed = false): void {
		this.#rewriteState(
			resetSeed
				? { ...this.#initialState, $$seed: getRandomInteger() }
				: this.#initialState,
		);

		this.#setIndex(0);
	}

	/** For saves the need to exported out of the browser */
	async saveToExport(): Promise<string> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			"export",
			async () => {
				const { compress } = this.#config;

				const exportData: typeof this._type.exportData = {
					plugins: await this.#getPluginSaveData(false),
					saveData: await this.#getSaveData(),
				};

				//@ts-expect-error Inference Limitation
				const stringifiedExportData = serialize(exportData);

				const finalDataToExport = await compressStringIfApplicable(
					stringifiedExportData,
					compress,
				);

				return finalDataToExport;
			},
		);
	}

	/** Using the provided persistence adapter, this saves all vital data for the combined state, metadata, and current index
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the persistence adapter is not available
	 */
	async saveToSaveSlot(saveSlot?: number): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			saveSlot,
			async () => {
				const { persistence, compress: shouldCompressSave } = this.#config;

				const saveKey =
					typeof saveSlot === "number"
						? this.#getSaveSlotStorageKey(saveSlot)
						: this.#getAutoSaveStorageKey();

				const saveData = await this.#getSaveData();

				//@ts-expect-error Inference Limitation
				const stringifiedSaveData = serialize(saveData);

				const dataToStore = await compressStringIfApplicable(
					stringifiedSaveData,
					shouldCompressSave,
				);

				await persistence.set(saveKey, dataToStore);
			},
		);
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
		const randomNumber = prng.nextFloat();

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

	#assertSaveSlotIsValid(saveSlot: number): void {
		const { saveSlots: MAX_SAVE_SLOTS } = this.#config;

		const ERROR_TEXT = "Unable to save.";

		if (saveSlot < MINIMUM_SAVE_SLOT_INDEX || saveSlot >= MAX_SAVE_SLOTS) {
			throw Error(`${ERROR_TEXT} Save slot ${saveSlot} is invalid.`);
		}
	}

	// Some of these could be properties instead, but I like the consistency
	#getAutoSaveStorageKey(): SugarBoxAutoSaveKey {
		return `sugarbox-${this.name}-autosave`;
	}

	#getPluginStorageKey(pluginId: string): SugarBoxPluginSaveKey {
		return `sugarbox-${this.name}-plugin-${pluginId}` as const;
	}

	#getSaveSlotStorageKey(saveSlot: number): SugarBoxNormalSaveKey {
		this.#assertSaveSlotIsValid(saveSlot);
		return `sugarbox-${this.name}-slot${saveSlot}` as const;
	}

	async *#getKeysOfPresentSaves(): AsyncGenerator<SugarBoxSaveKey> {
		const persistence = this.#persistenceAdapter;

		const keys = await persistence.keys?.();

		const autosaveKey = this.#getAutoSaveStorageKey();

		const saveSlotKeyPrefix = `sugarbox-${this.name}-slot` as const;

		if (keys) {
			// Filter out the keys that are not save slots
			for (const key of keys) {
				if (key.startsWith(saveSlotKeyPrefix) || key === autosaveKey) {
					//@ts-expect-error TS doesn't know that the key is a SugarBoxSaveKey
					yield key;
				}
			}
		} else {
			// Fallback to using get() to get the keys
			if (await persistence.get(autosaveKey)) {
				yield autosaveKey;
			}

			for (let i = 0; i < this.#config.saveSlots; i++) {
				const key = this.#getSaveSlotStorageKey(i);

				if (await persistence.get(key)) {
					yield key;
				}
			}
		}
	}

	async #getMostRecentSave(): Promise<typeof this._type.saveData | null> {
		let mostRecentSave: typeof this._type.saveData | null = null;

		for await (const { data } of this.getSaves()) {
			if (!mostRecentSave) {
				mostRecentSave = data;
			} else {
				if (data.savedOn > mostRecentSave.savedOn) {
					mostRecentSave = data;
				}
			}
		}

		return mostRecentSave;
	}

	#isPassageIdValid(passageId: string): boolean {
		return this.#passages.has(passageId);
	}

	#setIndex(val: number) {
		if (val < 0 || val >= this.#snapshotCount) {
			throw new RangeError("Index out of bounds");
		}

		const oldPassage = this.passage;

		const oldState = this.#shouldCloneOldState ? clone(this.vars) : this.vars;

		this.#index = val;

		this.#emitCustomEvent(":passageChange", {
			newPassage: this.passage,
			oldPassage,
		});

		this.#emitCustomEvent(":stateChange", {
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

		const state = clone<typeof this._type.state.complete>(this.#initialState);

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

	/** **WARNING:** This will **replace** the intialState and **empty** all the snapshots. */
	#rewriteState(
		stateToReplaceTheCurrentOne: typeof this._type.state.complete,
	): void {
		this.#initialState = stateToReplaceTheCurrentOne;

		this.#stateSnapshots = this.#stateSnapshots.map((_) => ({}));

		this.#stateCache?.clear();
	}

	#createCustomEvent<TEventType extends keyof typeof this._type.events>(
		name: TEventType,
		data: (typeof this._type.events)[TEventType],
	): CustomEvent<(typeof this._type.events)[TEventType]> {
		return new CustomEvent(name, { detail: data });
	}

	#dispatchCustomEvent(event: CustomEvent): boolean {
		return this.#eventTarget.dispatchEvent(event);
	}

	#emitCustomEvent<TEventType extends keyof typeof this._type.events>(
		name: TEventType,
		data: (typeof this._type.events)[TEventType],
	): boolean {
		const dispatchResult = this.#dispatchCustomEvent(
			this.#createCustomEvent(name, data),
		);

		const { autoSave } = this.#config;

		switch (name) {
			case ":passageChange": {
				if (autoSave === "passage") {
					this.saveToSaveSlot();
				}
				break;
			}

			case ":stateChange": {
				if (autoSave === "state") {
					this.saveToSaveSlot();
				}
			}
		}

		return dispatchResult;
	}

	async #emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback<
		TCallBackReturnValue,
	>(
		operation: "save" | "load",
		saveSlot: number | "autosave" | "export" | "recent" | undefined,
		callback: () => Promise<TCallBackReturnValue>,
	): Promise<TCallBackReturnValue> {
		const slot = saveSlot ?? "autosave";

		this.#emitCustomEvent(operation === "save" ? ":saveStart" : ":loadStart", {
			slot,
		});

		const endEvent = operation === "save" ? ":saveEnd" : ":loadEnd";

		try {
			const result = await callback();

			this.#emitCustomEvent(endEvent, {
				slot,
				type: "success",
			});

			return result;
		} catch (e) {
			this.#emitCustomEvent(endEvent, {
				error: sanitiseError(e),
				slot,
				type: "error",
			});

			throw e;
		}
	}

	#assertPluginExists(pluginId: string): SugarboxPlugin {
		const plugin = this.#plugins[pluginId];

		if (!plugin) throw Error(`Plugin ''${pluginId}'' has not been mounted.`);

		return plugin;
	}

	async #getPluginState(pluginId: string): Promise<GenericObject | null> {
		const plugin = this.#assertPluginExists(pluginId);

		const state = this.#pluginState[pluginId];

		if (state) return state;

		const newState = await plugin.initState?.();

		if (newState) {
			this.#pluginState[pluginId] = newState;

			return newState;
		}

		return null;
	}

	/** Only useful for plguins that shouldn't store their state with story data */
	async #savePluginDataToStoragePartition(pluginId: string): Promise<void> {
		const plugin = this.#assertPluginExists(pluginId);
		const pluginState = await this.#getPluginState(pluginId);

		if (!pluginState) {
			console.warn(
				`Cannot save data for plugin ''${pluginId}'' since no such state exists.`,
			);
			return;
		}

		const { method, withSave } = plugin.serialize ?? {};

		if (!method || withSave == null || withSave === true) {
			return;
		}

		const serializableState = await method(pluginState);

		const key = this.#getPluginStorageKey(pluginId);

		await this.#persistenceAdapter.set(key, serialize(serializableState));
	}

	async #loadPluginDataFromStoragePartition(pluginId: string): Promise<void> {
		const plugin = this.#assertPluginExists(pluginId);

		const storageKey = this.#getPluginStorageKey(pluginId);
		const stringifiedData = await this.#persistenceAdapter.get(storageKey);

		if (!stringifiedData) return;

		const { data, version }: SugarboxPluginSaveStructure = deserialize(
			stringifiedData,
		) as unknown as SugarboxPluginSaveStructure;

		await plugin.onDeserialize?.({
			data,
			state: this.#pluginState[pluginId],
			version,
		});
	}

	/** TODO: make this cleaner.
	 * Using the plugin ids, attempts to load all plugin data from their persistent partitions
	 *
	 * NOTE: `this.#plugins` must be populated before hand
	 */
	async #loadPluginSaveDataFromStorageArea() {
		const promises: Promise<void>[] = [];

		for (const pluginId in this.#plugins) {
			promises.push(this.#loadPluginDataFromStoragePartition(pluginId));
		}

		await Promise.all(promises);
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

	async #getSaveData(): Promise<typeof this._type.saveData> {
		return {
			intialState: this.#initialState,
			lastPassageId: this.passageId,
			plugins: await this.#getPluginSaveData(true),
			savedOn: new Date(),
			saveVersion: this.#config.saveVersion,
			snapshots: this.#stateSnapshots,
			storyIndex: this.#index,
		};
	}

	/** Mounts and initializes a plugin */
	async #usePlugin(
		pluginToUse: SugarboxPlugin,
		config?: GenericObject,
	): Promise<void> {
		const {
			id,
			initApi,
			initState,
			onOverride,
			dependencies = [],
		} = pluginToUse;

		const activePluginUsingNameSpace: SugarboxPlugin | undefined =
			//@ts-expect-error Inference Limitation
			this.$[id];

		const isNamespaceUsed = !!activePluginUsingNameSpace;

		const applyPlugin = async () => {
			const engine = this;

			engine.#plugins[id] = pluginToUse;

			for (const { config: depConfig, plugin: depPlugin } of dependencies) {
				try {
					await engine.#usePlugin(depPlugin, depConfig);
				} catch {
					console.warn(
						`Plugin ${depPlugin.id} could not be mounted, perhaps it was already mounted?`,
					);
				}
			}

			const intialPluginState = (await initState?.()) ?? {};
			this.#pluginState[id] = intialPluginState;

			const mutations =
				(await initApi?.({
					config,
					engine,
					state: intialPluginState,
					async triggerSave() {
						await engine.#savePluginDataToStoragePartition(id);
					},
				})) ?? {};

			//@ts-expect-error Type schenanigans
			engine.$[id] = mutations;

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

	// TODO: add tests for these
	/** Plugin save data that should be stored with saves or outside of saves */
	async #getPluginSaveData(
		shouldBeBoundToSave: boolean,
	): Promise<Record<string, SugarboxPluginSaveStructure>> {
		const saveData: Record<string, SugarboxPluginSaveStructure> = {};

		const pendingPromises: Promise<void>[] = [];

		for (const pluginId in this.#plugins) {
			const { serialize, version } = this.#plugins[pluginId]!;

			if (!serialize) continue;

			const { method, withSave } = serialize;

			switch (shouldBeBoundToSave) {
				case true:
					if (!withSave) continue;
					break;
				case false:
					if (withSave) continue;
					break;
			}

			pendingPromises.push(
				(async () => {
					saveData[pluginId] = {
						data: await method(this.#pluginState[pluginId]!),
						version: version!,
					};
				})(),
			);
		}

		await Promise.all(pendingPromises);

		return saveData;
	}
}

const sanitiseError = (possibleError: unknown) =>
	possibleError instanceof Error ? possibleError : Error(String(possibleError));

const getRandomInteger = () => Math.floor(Math.random() * 2 ** 32);

export { SugarboxEngine };
