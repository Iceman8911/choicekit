import { describe, expect, it } from "bun:test";
import { ChoicekitClassInstance } from "@packages/engine-class";
import { definePlugin, type ValidatePluginGenerics } from "../plugins/plugin";
import { ChoicekitEngineBuilder } from "./builder";
import type { ChoicekitType } from "./types/Choicekit";

type TimelinePluginGenerics = ValidatePluginGenerics<{
	id: "timeline";
	api: {
		getValue: () => number;
		setValue: (value: number) => Promise<void>;
	};
	serializedState: {
		value: number;
	};
	state: {
		value: number;
	};
}>;

const timelinePlugin = definePlugin<TimelinePluginGenerics>({
	id: "timeline",
	initApi: ({ state, triggerSave }) => ({
		getValue: () => state.value,
		setValue: async (value: number) => {
			state.value = value;
			await triggerSave();
		},
	}),
	initState: () => ({ value: 0 }),
	onDeserialize: ({ data, state }) => {
		state.value = data.value;
	},
	serialize: {
		method: ({ value }) => ({ value }),
		withSave: true,
	},
});

type StoryProgressPluginGenerics = ValidatePluginGenerics<{
	id: "storyProgress";
	api: {
		completeScene: (sceneId: string) => Promise<void>;
		getCompletedScenes: () => string[];
	};
	serializedState: {
		completedScenes: string[];
	};
	state: {
		completedScenes: string[];
	};
}>;

const storyProgressPlugin = definePlugin<StoryProgressPluginGenerics>({
	id: "storyProgress",
	initApi: ({ state, triggerSave }) => ({
		completeScene: async (sceneId: string) => {
			if (!state.completedScenes.includes(sceneId)) {
				state.completedScenes.push(sceneId);
			}

			await triggerSave();
		},
		getCompletedScenes: () => [...state.completedScenes],
	}),
	initState: () => ({ completedScenes: [] }),
	onDeserialize: ({ data, state }) => {
		state.completedScenes = [...data.completedScenes];
	},
	serialize: {
		method: ({ completedScenes }) => ({ completedScenes }),
		withSave: true,
	},
});

describe("ChoicekitEngine persistence", () => {
	it("should create exportable save data", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("SaveExport")
			.withVars({ score: 0 })
			.withPassages(
				{ data: "Start", name: "start", tags: [] },
				{ data: "End", name: "end", tags: [] },
			)
			.build();

		engine.setVars((v) => {
			v.score = 9999;
		});
		engine.navigateTo("end");

		const exported = await engine.saveToExport();

		expect(typeof exported).toBe("string");
		expect(exported.length).toBeGreaterThan(0);

		engine.setVars((v) => {
			v.score = -1;
		});
		engine.navigateTo("start");

		await engine.loadFromExport(exported);

		expect(engine.vars.score).toBe(9999);
		expect(engine.passageId).toBe("end");
	});

	it("should save to default persistence adapter", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PersistSave")
			.withVars({ data: 123 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		engine.setVars((v) => {
			v.data = 456;
		});

		await expect(engine.saveToSaveSlot(1)).resolves.toBeUndefined();

		const reader = await new ChoicekitEngineBuilder()
			.withName("PersistSave")
			.withVars({ data: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig({ loadOnStart: false })
			.build();

		await reader.loadFromSaveSlot(1);
		expect(reader.vars.data).toBe(456);
	});

	it("should handle autosave configuration", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("Autosave")
			.withVars({ value: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig({
				autoSave: "state",
				loadOnStart: false,
			})
			.build();

		const autosaved = new Promise<void>((resolve) => {
			const unsubscribe = engine.on("saveEnd", (event) => {
				if (event.slot === "autosave" && event.type === "success") {
					unsubscribe();
					resolve();
				}
			});
		});

		engine.setVars((v) => {
			v.value = 100;
		});

		await autosaved;

		const loader = await new ChoicekitEngineBuilder()
			.withName("Autosave")
			.withVars({ value: -999 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig({ loadOnStart: false })
			.build();

		await loader.loadFromSaveSlot();

		expect(engine.vars.value).toBe(100);
		expect(loader.vars.value).toBe(100);
	});

	it("should load most recent save by default when loadOnStart is true", async () => {
		const writer = await new ChoicekitEngineBuilder()
			.withName("LoadOnStartDefault")
			.withVars({ score: 0 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({ loadOnStart: false })
			.build();

		writer.setVars((state) => {
			state.score = 99;
		});
		await writer.saveToSaveSlot(0);

		const loader = await new ChoicekitEngineBuilder()
			.withName("LoadOnStartDefault")
			.withVars({ score: -1 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.build();

		expect(loader.vars.score).toBe(99);
	});

	it("should persist saveVersion in save payloads", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("ConfiguredSaveVersion")
			.withVars({ hp: 10 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				loadOnStart: false,
				saveVersion: "3.1.4",
			})
			.build();

		await engine.saveToSaveSlot(2);

		let saveData: ChoicekitType.SaveData | null = null;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 2) {
				saveData = save.data;
				break;
			}
		}

		expect(saveData?.version).toBe("3.1.4");
	});

	it("should honor strict vs liberal saveCompat rules", async () => {
		const strictEngine = await new ChoicekitEngineBuilder()
			.withName("StrictCompat")
			.withVars({ hp: 10 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				loadOnStart: false,
				saveCompat: "strict",
				saveVersion: "1.2.0",
			})
			.build();

		await strictEngine.saveToSaveSlot(0);

		let strictSaveData: ChoicekitType.SaveData<{ hp: number }> | null = null;
		for await (const save of strictEngine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				strictSaveData = save.data;
				break;
			}
		}

		expect(strictSaveData).not.toBeNull();

		expect(() =>
			// @ts-expect-error Intentionally tampering with save version to test runtime compatibility mode handling
			strictEngine.loadSaveFromData({
				...(strictSaveData as ChoicekitType.SaveData<{ hp: number }>),
				version: "1.1.0",
			}),
		).toThrow();

		const liberalEngine = await new ChoicekitEngineBuilder()
			.withName("LiberalCompat")
			.withVars({ hp: 1 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				loadOnStart: false,
				saveCompat: "liberal",
				saveVersion: "1.2.0",
			})
			.build();

		liberalEngine.loadSaveFromData({
			intialState: {
				$$id: "main",
				$$plugins: new Map(),
				$$seed: 123,
				hp: 42,
			},
			lastPassageId: "main",
			savedOn: new Date(),
			snapshots: [
				{
					$$id: "main",
					$$plugins: new Map(),
					$$seed: 123,
					hp: 42,
				},
			],
			storyIndex: 0,
			version: "1.1.0",
		});

		expect(liberalEngine.vars.hp).toBe(42);
	});

	it("should toggle compression behavior based on compress config", async () => {
		const largeValue = "x".repeat(4000);

		const compressedStore = new Map<string, string>();
		const compressedPersistence = {
			async delete(key: string) {
				compressedStore.delete(key);
			},
			async get(key: string) {
				return compressedStore.get(key);
			},
			async keys() {
				return compressedStore.keys();
			},
			async set(key: string, data: string) {
				compressedStore.set(key, data);
			},
		};

		const compressedEngine = await new ChoicekitEngineBuilder()
			.withName("CompressionOn")
			.withVars({ blob: largeValue })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				compress: true,
				loadOnStart: false,
				persistence: compressedPersistence,
			})
			.build();

		await compressedEngine.saveToSaveSlot(0);

		expect(
			compressedStore.get("choicekit-CompressionOn-slot0")?.startsWith('{"'),
		).toBe(false);

		const uncompressedStore = new Map<string, string>();
		const uncompressedPersistence = {
			async delete(key: string) {
				uncompressedStore.delete(key);
			},
			async get(key: string) {
				return uncompressedStore.get(key);
			},
			async keys() {
				return uncompressedStore.keys();
			},
			async set(key: string, data: string) {
				uncompressedStore.set(key, data);
			},
		};

		const uncompressedEngine = await new ChoicekitEngineBuilder()
			.withName("CompressionOff")
			.withVars({ blob: largeValue })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				compress: false,
				loadOnStart: false,
				persistence: uncompressedPersistence,
			})
			.build();

		await uncompressedEngine.saveToSaveSlot(0);

		expect(
			uncompressedStore.get("choicekit-CompressionOff-slot0")?.startsWith('{"'),
		).toBe(true);
	});

	it("should autosave on passage changes when autoSave is passage", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("AutosavePassage")
			.withVars({ value: 1 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({ autoSave: "passage", loadOnStart: false })
			.build();

		const autosaved = new Promise<void>((resolve) => {
			const unsubscribe = engine.on("saveEnd", (event) => {
				if (event.slot === "autosave" && event.type === "success") {
					unsubscribe();
					resolve();
				}
			});
		});

		engine.navigateTo("b");
		await autosaved;

		const loader = await new ChoicekitEngineBuilder()
			.withName("AutosavePassage")
			.withVars({ value: -1 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({ loadOnStart: false })
			.build();

		await loader.loadFromSaveSlot();
		expect(loader.passageId).toBe("b");
	});

	it("should share save slots across engine instances with the same name", async () => {
		const sharedName = "SharedSavesEngine";

		const engine1 = await new ChoicekitEngineBuilder()
			.withName(sharedName)
			.withVars({ hp: 10, xp: 0 })
			.withPassages(
				{
					data: "test",
					name: "main",
					tags: [],
				},
				{
					data: "next",
					name: "next",
					tags: [],
				},
			)
			.build();

		engine1.navigateTo("next");

		engine1.setVars((v) => {
			v.hp = 42;
			v.xp = 99;
		});

		await engine1.saveToSaveSlot(3);

		const engine2 = await new ChoicekitEngineBuilder()
			.withName(sharedName)
			.withVars({ hp: 0, xp: 0 })
			.withPassages(
				{
					data: "test",
					name: "main",
					tags: [],
				},
				{
					data: "next",
					name: "next",
					tags: [],
				},
			)
			.withConfig({ loadOnStart: false })
			.build();

		await engine2.loadFromSaveSlot(3);

		expect(engine2.vars.hp).toBe(engine1.vars.hp);
		expect(engine2.vars.xp).toBe(engine1.vars.xp);
	});

	it("should isolate save slots for engines with different names", async () => {
		const engineA = await new ChoicekitEngineBuilder()
			.withName("Engine-A")
			.withVars({ flag: "A", score: 123 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		engineA.setVars((v) => {
			v.flag = "A-saved";
			v.score = 999;
		});

		await engineA.saveToSaveSlot(2);

		const engineB = await new ChoicekitEngineBuilder()
			.withName("Engine-B")
			.withVars({ flag: "B", score: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig({ loadOnStart: false })
			.build();

		await expect(engineB.loadFromSaveSlot(2)).rejects.toThrow();

		expect(engineB.vars.flag).toBe("B");
		expect(engineB.vars.score).toBe(0);
	});

	it("should enumerate and delete saves through getSaves and deleteSaveSlot", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("SaveEnumeration")
			.withVars({ chapter: 0 })
			.withPassages(
				{ data: "start", name: "start", tags: [] },
				{ data: "mid", name: "mid", tags: [] },
			)
			.withConfig({ autoSave: "state", loadOnStart: false })
			.build();

		const autosaved = new Promise<void>((resolve) => {
			const unsubscribe = engine.on("saveEnd", (event) => {
				if (event.slot === "autosave" && event.type === "success") {
					unsubscribe();
					resolve();
				}
			});
		});

		engine.setVars((v) => {
			v.chapter = 1;
		});

		await autosaved;
		await engine.saveToSaveSlot(1);
		await engine.saveToSaveSlot(2);

		const saves: Array<{ type: string; slot?: number }> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				saves.push({ slot: save.slot, type: save.type });
			} else {
				saves.push({ type: save.type });
			}
		}

		expect(saves.some((save) => save.type === "autosave")).toBe(true);
		expect(
			saves.some((save) => save.type === "normal" && save.slot === 1),
		).toBe(true);
		expect(
			saves.some((save) => save.type === "normal" && save.slot === 2),
		).toBe(true);

		await engine.deleteSaveSlot(1);
		await expect(engine.loadFromSaveSlot(1)).rejects.toThrow();
		await expect(engine.loadFromSaveSlot(2)).resolves.toBeUndefined();
	});

	it("should reject invalid save slot indexes on save and load", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("InvalidSaveSlots")
			.withVars({ value: 1 })
			.withPassages({
				data: "main",
				name: "main",
				tags: [],
			})
			.build();

		expect(engine.saveToSaveSlot(-1)).rejects.toThrow();
		expect(engine.saveToSaveSlot(99)).rejects.toThrow();
		expect(engine.loadFromSaveSlot(99)).rejects.toThrow();
	});

	it("should delete all save slots including autosave", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("DeleteAllSaves")
			.withVars({ value: 0 })
			.withPassages({
				data: "main",
				name: "main",
				tags: [],
			})
			.withConfig({ autoSave: "state", loadOnStart: false })
			.build();

		const autosaved = new Promise<void>((resolve) => {
			const unsubscribe = engine.on("saveEnd", (event) => {
				if (event.slot === "autosave" && event.type === "success") {
					unsubscribe();
					resolve();
				}
			});
		});

		engine.setVars((v) => {
			v.value = 1;
		});
		await autosaved;

		await engine.saveToSaveSlot(0);
		await engine.saveToSaveSlot(2);

		await engine.deleteAllSaveSlots();

		await expect(engine.loadFromSaveSlot()).rejects.toThrow();
		await expect(engine.loadFromSaveSlot(0)).rejects.toThrow();
		await expect(engine.loadFromSaveSlot(2)).rejects.toThrow();
	});

	it("should load the latest save with loadRecentSave", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("RecentSave")
			.withVars({ chapter: 0 })
			.withPassages(
				{ data: "intro", name: "intro", tags: [] },
				{ data: "boss", name: "boss", tags: [] },
			)
			.withConfig({ loadOnStart: false })
			.build();

		engine.setVars((v) => {
			v.chapter = 1;
		});
		await engine.saveToSaveSlot(0);

		await new Promise((resolve) => setTimeout(resolve, 2));

		engine.navigateTo("boss");
		engine.setVars((v) => {
			v.chapter = 2;
		});
		await engine.saveToSaveSlot(1);

		const loader = await new ChoicekitEngineBuilder()
			.withName("RecentSave")
			.withVars({ chapter: -1 })
			.withPassages(
				{ data: "intro", name: "intro", tags: [] },
				{ data: "boss", name: "boss", tags: [] },
			)
			.withConfig({ loadOnStart: false })
			.build();

		await loader.loadRecentSave();

		expect(loader.vars.chapter).toBe(2);
		expect(loader.passageId).toBe("boss");
	});

	it("should restore state from loadSaveFromData", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("LoadFromData")
			.withVars({ hp: 10, mana: 5 })
			.withPassages(
				{ data: "town", name: "town", tags: [] },
				{ data: "dungeon", name: "dungeon", tags: [] },
			)
			.withConfig({ loadOnStart: false })
			.build();

		engine.navigateTo("dungeon");
		engine.setVars((v) => {
			v.hp = 6;
			v.mana = 2;
		});
		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData | undefined;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = save.data;
			}
		}

		expect(saveData).toBeDefined();

		engine.setVars((v) => {
			v.hp = 100;
			v.mana = 100;
		});
		engine.navigateTo("town");

		//@ts-expect-error Can't be bothered to copy out the full type :p
		await engine.loadSaveFromData(saveData);

		expect(engine.vars.hp).toBe(6);
		expect(engine.vars.mana).toBe(2);
		expect(engine.passageId).toBe("dungeon");
	});

	it("should preserve plugin metadata in callback-based vars saves", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("CallbackVarsPluginMetadata")
			.withVars(() => ({ hp: 5 }))
			.withPassages({
				data: "start",
				name: "start",
				tags: [],
			})
			.withConfig({ loadOnStart: false })
			.withPlugin(timelinePlugin, undefined)
			.build();

		await engine.$.timeline.setValue(77);
		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData | null = null;

		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = save.data;
				break;
			}
		}

		expect(saveData).not.toBeNull();
		expect(saveData?.intialState.$$plugins).toEqual(new Map());
		expect(saveData?.snapshots[0]?.$$plugins?.get("timeline")?.data).toEqual({
			value: 77,
		});
	});

	it("should round-trip withSave plugin state through a story save slot", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("StoryProgressSlotRoundTrip")
			.withVars({ chapter: 0 })
			.withPassages(
				{ data: "Intro", name: "intro", tags: ["start"] },
				{ data: "Hallway", name: "hallway", tags: ["mid"] },
				{ data: "End", name: "end", tags: ["final"] },
			)
			.withPlugin(storyProgressPlugin, undefined)
			.withConfig({ loadOnStart: false })
			.build();

		await engine.$.storyProgress.completeScene("intro");
		engine.navigateTo("hallway");
		await engine.$.storyProgress.completeScene("hallway");
		const historyIndexBeforeSave = engine.index;
		await engine.saveToSaveSlot(4);

		engine.navigateTo("end");
		await engine.$.storyProgress.completeScene("end");

		const reader = await new ChoicekitEngineBuilder()
			.withName("StoryProgressSlotRoundTrip")
			.withVars({ chapter: -1 })
			.withPassages(
				{ data: "Intro", name: "intro", tags: ["start"] },
				{ data: "Hallway", name: "hallway", tags: ["mid"] },
				{ data: "End", name: "end", tags: ["final"] },
			)
			.withPlugin(storyProgressPlugin, undefined)
			.withConfig({ loadOnStart: false })
			.build();

		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([]);

		await reader.loadFromSaveSlot(4);

		expect(reader.vars.chapter).toBe(0);
		expect(reader.passageId).toBe("hallway");
		expect(reader.index).toBe(historyIndexBeforeSave);

		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([
			"intro",
			"hallway",
		]);

		const currentPassage = reader.getPassages({
			tags: ["mid"],
			type: "any",
		})[0];
		expect(currentPassage).toBeDefined();
		expect(currentPassage?.name).toBe("hallway");
		expect(currentPassage?.data).toBe("Hallway");

		reader.navigateTo("end");
		expect(reader.passageId).toBe("end");
		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([
			"intro",
			"hallway",
		]);

		await reader.$.storyProgress.completeScene("end");
		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([
			"intro",
			"hallway",
			"end",
		]);
	});

	it("should migrate old saves with registerMigrators", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("MigrationFlow")
			.withVars({ hp: 5 })
			.withPassages({
				data: "main",
				name: "main",
				tags: [],
			})
			.withConfig({
				loadOnStart: false,
				saveVersion: "2.0.0",
			})
			.build();

		engine.registerMigrators({
			data: {
				migrater: (oldData: { hp: number }) => ({ hp: oldData.hp + 7 }),
				to: "2.0.0",
			},
			from: "1.0.0",
		});

		expect(() =>
			engine.registerMigrators({
				data: {
					migrater: (oldData: { hp: number }) => oldData,
					to: "2.0.0",
				},
				from: "1.0.0",
			}),
		).toThrow();

		engine.setVars((v) => {
			v.hp = 10;
		});

		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData | undefined;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = save.data;
			}
		}

		expect(saveData).toBeDefined();

		//@ts-expect-error Can't be bothered to copy out the full type :p
		await engine.loadSaveFromData({
			...saveData,
			version: "1.0.0",
		});

		expect(engine.vars.hp).toBe(17);
	});

	it("should emit save, load, and delete lifecycle events with slot metadata", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("LifecycleEvents")
			.withVars({ points: 1 })
			.withPassages(
				{
					data: "main",
					name: "main",
					tags: [],
				},
				{
					data: "other",
					name: "other",
					tags: [],
				},
			)
			.withConfig({ loadOnStart: false })
			.build();

		const seen: string[] = [];
		let historyChangeSeen = false;

		engine.on("saveStart", (event) => {
			seen.push(`saveStart:${event.slot}`);
		});

		engine.on("saveEnd", (event) => {
			seen.push(`saveEnd:${event.type}:${event.slot}`);
		});

		engine.on("loadStart", (event) => {
			seen.push(`loadStart:${event.slot}`);
		});

		engine.on("loadEnd", (event) => {
			seen.push(`loadEnd:${event.type}:${event.slot}`);
		});

		engine.on("deleteStart", (event) => {
			seen.push(`deleteStart:${event.slot}`);
		});

		engine.on("deleteEnd", (event) => {
			seen.push(`deleteEnd:${event.type}:${event.slot}`);
		});

		engine.on("historyChange", (event) => {
			historyChangeSeen = event.oldIndex !== event.newIndex;
		});

		engine.navigateTo("other");

		await engine.saveToSaveSlot(0);
		engine.navigateTo("main");
		await engine.loadFromSaveSlot(0);
		await engine.deleteSaveSlot(0);

		expect(seen).toContain("saveStart:0");
		expect(seen).toContain("saveEnd:success:0");
		expect(seen).toContain("loadStart:0");
		expect(seen).toContain("loadEnd:success:0");
		expect(seen).toContain("deleteStart:0");
		expect(seen).toContain("deleteEnd:success:0");
		expect(historyChangeSeen).toBe(true);

		await expect(engine.loadFromSaveSlot(9)).rejects.toThrow();
		expect(seen).toContain("loadEnd:error:9");
	});

	it("should register story classes for save and load round-trips", async () => {
		type HeroSerialized = { hp: number; name: string };

		class StoryHero extends ChoicekitClassInstance<HeroSerialized> {
			static readonly classId = "StoryHeroForEngineTest";

			constructor(
				public hp: number,
				public name: string,
			) {
				super();
			}

			toJSON(): HeroSerialized {
				return { hp: this.hp, name: this.name };
			}

			static fromJSON(data: HeroSerialized): StoryHero {
				return new StoryHero(data.hp, data.name);
			}
		}

		const engine = await new ChoicekitEngineBuilder()
			.withName("RegisteredClasses")
			.withVars({ hero: new StoryHero(30, "Mira") })
			.withPassages({
				data: "main",
				name: "main",
				tags: [],
			})
			.withConfig({ loadOnStart: false })
			.build();

		engine.registerClasses(StoryHero);

		const exported = await engine.saveToExport();

		engine.setVars((v) => {
			v.hero = new StoryHero(1, "Temp");
		});

		await engine.loadFromExport(exported);

		expect(engine.vars.hero).toBeInstanceOf(StoryHero);
		expect(engine.vars.hero.name).toBe("Mira");
		expect(engine.vars.hero.hp).toBe(30);
	});
});
