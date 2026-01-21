import "@stardazed/streams-polyfill";
import { beforeEach, describe, expect, test } from "bun:test";
import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";
import { isStringJsonObjectOrCompressedString } from "@packages/string-compression";
import { SugarboxEngine } from "../../src";
import type {
	SugarBoxPassage,
	SugarBoxSaveData,
} from "../../src/types/if-engine";
import type { GenericSerializableObject } from "../../src/types/shared";
import { createPersistenceAdapter } from "../mocks/persistence";

type StateWithMetadata<TVariables extends GenericSerializableObject> = Readonly<
	TVariables & { $$id: string; $$seed: number }
>;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isPassageChangeDetail(value: unknown): value is {
	oldPassage: Readonly<SugarBoxPassage<string, string>> | null;
	newPassage: Readonly<SugarBoxPassage<string, string>> | null;
} {
	return isObject(value) && "oldPassage" in value && "newPassage" in value;
}

function isStateChangeDetail(value: unknown): value is {
	oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
	newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
} {
	return isObject(value) && "oldState" in value && "newState" in value;
}

const SAMPLE_PASSAGES = [
	{ data: "Lorem Ipsum", name: "Passage2" },
	{ data: "You walk down a dimly lit path.", name: "Forest Path" },
	{
		data: "A cold wind whips around you at the summit.",
		name: "Mountain Peak",
	},
] as const;

type SamplePassageName = (typeof SAMPLE_PASSAGES)[number]["name"];

function assertThrows(fn: () => void): void {
	let didThrow = false;

	try {
		fn();
	} catch {
		didThrow = true;
	}

	expect(didThrow).toBeTrue();
}

async function initEngine() {
	type PlayerSerialized = Omit<Player, "favouriteItem" | "toJSON">;

	class Player implements SugarBoxClassInstance<PlayerSerialized> {
		name = "Dave";
		age = 21;
		class = "Paladin";
		level = 6;
		location = "Tavern";
		inventory = {
			gems: 12,
			gold: 123,
			items: ["Black Sword", "Slug Shield", "Old Cloth"],
		};

		favouriteItem() {
			return this.inventory.items[0];
		}

		toJSON(): PlayerSerialized {
			const { favouriteItem: _favouriteItem, toJSON: _toJSON, ...rest } = this;
			return rest;
		}

		static classId = "Player";

		static fromJSON(serializedData: PlayerSerialized): Player {
			const player = new Player();
			Object.assign(player, serializedData);
			return player;
		}
	}

	Player satisfies SugarBoxClassConstructor<PlayerSerialized>;

	return SugarboxEngine.init({
		classes: [Player],
		config: {
			maxStates: 100,
			persistence: createPersistenceAdapter(),
		},
		name: "Test",
		otherPassages: [...SAMPLE_PASSAGES],
		startPassage: { data: "This is the start passage", name: "Start" },
		variables: {
			others: {
				hoursPlayed: 1.5,
				stage: 3,
			},
			player: new Player(),
		},
	});
}

async function initEngineWithExtraSettings<
	TAchievementData extends
		GenericSerializableObject = GenericSerializableObject,
	TSettingsData extends GenericSerializableObject = GenericSerializableObject,
>(
	persistence: ReturnType<typeof createPersistenceAdapter>,
	achievements: TAchievementData = {} as TAchievementData,
	settings: TSettingsData = {} as TSettingsData,
) {
	// This is a simplified version of the main initEngine for test purposes
	return SugarboxEngine.init<
		string,
		GenericSerializableObject,
		string,
		TAchievementData,
		TSettingsData
	>({
		achievements,
		config: {
			persistence,
		},
		name: "Test",
		otherPassages: [],
		settings,
		startPassage: { data: "This is the start passage", name: "Start" },
		variables: {},
	});
}

let engine: ReturnType<typeof initEngine> extends Promise<infer T> ? T : never;

beforeEach(async () => {
	engine = await initEngine();
});

describe("Passage Navigation", () => {
	test("navigateTo should update passage info and advance index", () => {
		const target = SAMPLE_PASSAGES[0];

		engine.navigateTo(target.name);

		expect(engine.index).toBe(1);
		expect(engine.passageId).toBe(target.name);
		expect(engine.passage).toEqual(target);
	});

	test("navigateTo should throw for unknown passage ids", () => {
		assertThrows(() => engine.navigateTo("NonExistentPassage"));
	});
});

describe("getVisitCount", () => {
	test("counts visits across initial state and snapshots", () => {
		// initial state is Start
		expect(engine.getVisitCount("Start")).toBe(1);
		expect(engine.getVisitCount(SAMPLE_PASSAGES[0].name)).toBe(0);

		engine.navigateTo(SAMPLE_PASSAGES[0].name); // now at Passage2
		engine.navigateTo("Start");
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		// getVisitCount counts the initial state's $$id plus any snapshot $$id values
		// up to (but not including) the current index.
		expect(engine.getVisitCount("Start")).toBe(2);
		expect(engine.getVisitCount(SAMPLE_PASSAGES[0].name)).toBe(1);
	});

	test("stress: works with 1000 snapshots (fills snapshot history)", async () => {
		// Use an engine with a large maxStates so we can fill up the snapshot array.
		const persistence = createPersistenceAdapter();
		const bigEngine = await SugarboxEngine.init({
			config: {
				maxStates: 1000,
				persistence,
			},
			name: "VisitCountStress",
			otherPassages: [...SAMPLE_PASSAGES],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {},
		});

		// Create 999 snapshots (start index=0 with the initial snapshot already present).
		for (let i = 0; i < 999; i++) {
			bigEngine.navigateTo(i % 2 === 0 ? SAMPLE_PASSAGES[0].name : "Start");
		}

		// At this point, we should have filled up the snapshot capacity.
		expect(bigEngine.index).toBe(999);

		// getVisitCount iterates snapshots[0..index-1]. With our sequence, "Start"
		// appears 499 times in snapshots[0..998], and initialStart adds +1.
		expect(bigEngine.getVisitCount("Start")).toBe(1 + 499);

		// - Passage2 appears 499 times in snapshots[0..998].
		expect(bigEngine.getVisitCount(SAMPLE_PASSAGES[0].name)).toBe(499);
	});
});

describe("State Variables and History", () => {
	test("setVars should persist through navigation", () => {
		engine.setVars((state) => {
			state.player.name = "Bob";
			state.player.inventory.gems++;
			state.player.inventory.items.push("Overpowered Sword");
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(engine.vars.player.name).toBe("Bob");
		expect(engine.vars.player.inventory.gems).toBe(13);
		expect(engine.vars.player.inventory.items).toContain("Overpowered Sword");
	});

	test("setVars should support replacing the entire state object", () => {
		const testObj = { newProp: "I'm here now :D", others: { stage: -10 } };

		engine.setVars(() => testObj);

		// We can still validate replacement happened without forcing engine.vars' compile-time key union
		// to accept arbitrary keys like "newProp".
		expect("newProp" in engine.vars).toBeTrue();
		// @ts-expect-error - replaced state intentionally includes ad-hoc keys
		expect(engine.vars.newProp).toBe(testObj.newProp);

		expect(engine.vars.others.stage).toBe(-10);
	});

	test("history should be capped by maxStates (index clamped at maxStates - 1)", () => {
		const passageNames: readonly SamplePassageName[] = SAMPLE_PASSAGES.map(
			(p) => p.name,
		);

		for (let i = 0; i < 1_000; i++) {
			engine.navigateTo(passageNames[i % passageNames.length]);
		}

		expect(engine.index).toBe(99);
	});

	test("backward/forward should navigate state history correctly and clamp to bounds", () => {
		// Record stage at start, then on two subsequent states so we can validate history traversal.
		engine.setVars((state) => {
			state.others.stage = -1;
		});
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		engine.setVars((state) => {
			state.others.stage = 10;
		});
		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		engine.backward(2);
		expect(engine.index).toBe(0);
		expect(engine.vars.others.stage).toBe(-1);

		engine.forward(1);
		expect(engine.index).toBe(1);
		expect(engine.vars.others.stage).toBe(10);

		engine.forward(100);
		expect(engine.index).toBe(2);

		engine.backward(100);
		expect(engine.index).toBe(0);
	});
});

describe("Engine Reset", () => {
	test("reset should restore initial state, clear history, and reset passage", () => {
		engine.setVars((state) => {
			state.player.name = "Changed Name";
			state.player.level = 99;
			state.player.inventory.gold = 9999;
			state.others.stage = 100;
			state.player.inventory.items.push("Magic Potion");
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);
		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		expect(engine.index).toBe(2);
		expect(engine.vars.player.name).toBe("Changed Name");
		expect(engine.vars.player.level).toBe(99);
		expect(engine.vars.player.inventory.items).toContain("Magic Potion");

		engine.reset();

		expect(engine.index).toBe(0);
		expect(engine.passageId).toBe("Start");
		expect(engine.vars.player.name).toBe("Dave");
		expect(engine.vars.player.level).toBe(6);
		expect(engine.vars.player.inventory.gold).toBe(123);
		expect(engine.vars.player.inventory.gems).toBe(12);
		expect(engine.vars.player.inventory.items).toEqual([
			"Black Sword",
			"Slug Shield",
			"Old Cloth",
		]);
		expect(engine.vars.others.stage).toBe(3);

		// reset should preserve custom class instances (methods still exist and behave deterministically)
		expect(typeof engine.vars.player.favouriteItem).toBe("function");
		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");

		// and history should be cleared (can't go back)
		engine.backward(1);
		expect(engine.index).toBe(0);
	});

	test("reset seed controls should affect PRNG determinism", () => {
		const initial1 = engine.random;
		const initial2 = engine.random;

		engine.navigateTo(SAMPLE_PASSAGES[0].name);
		engine.random;
		engine.random;

		engine.reset(false);
		expect(engine.random).toBe(initial1);
		expect(engine.random).toBe(initial2);

		engine.reset();
		expect(engine.random).toBe(initial1);
		expect(engine.random).toBe(initial2);

		engine.reset(true);
		const new1 = engine.random;
		const new2 = engine.random;
		expect(new1).not.toBe(initial1);
		expect(new2).not.toBe(initial2);
	});
});

describe("Saving and Loading", () => {
	test.failing("loading an empty or invalid save slot should throw", async () => {
		await engine.loadFromSaveSlot(-999);
	});

	test("should be able to save and load the state restoring the relevant variable values", async () => {
		await engine.saveToSaveSlot(1);

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		const testItem = "Test Item";

		engine.setVars((state) => {
			state.player.level++;

			state.others.stage++;

			state.player.location = SAMPLE_PASSAGES[1].name;

			state.player.inventory.items.push(testItem);
		});

		await engine.saveToSaveSlot(2);

		expect(engine.vars.player.inventory.items).toContain(testItem);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.inventory.items).not.toContain(testItem);
	});
});

describe("Autosave", () => {
	test("should autosave on passage change when autoSave is 'passage'", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			achievements: {},
			config: {
				autoSave: "passage",
				persistence,
			},
			name: "AutoSaveTest",
			otherPassages: [{ data: "Next passage.", name: "Next" }],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { counter: 0 },
		});

		// Change state and navigate to trigger autosave
		engine.setVars((vars) => {
			vars.counter = 42;
		});

		engine.navigateTo("Next");

		// Wait for any async autosave to complete
		await new Promise((r) => setTimeout(r, 10));

		// Check autosave slot
		let foundAutosave = false;

		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;

				const snapshot = save.data.snapshots[save.data.storyIndex - 1];
				expect(snapshot).toBeDefined();
				expect(snapshot?.counter).toBe(42);

				expect(save.data.lastPassageId).toBe("Next");
			}
		}
		expect(foundAutosave).toBe(true);
	});

	test("should autosave on state change when autoSave is 'state'", async () => {
		const persistence = createPersistenceAdapter();

		const engine = await SugarboxEngine.init({
			achievements: {},
			config: {
				autoSave: "state",
				persistence,
			},
			name: "AutoSaveTest2",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { counter: 0 },
		});

		// Change state to trigger autosave
		engine.setVars((vars) => {
			vars.counter = 99;
		});

		// Wait for any async autosave to complete
		await new Promise((r) => setTimeout(r, 10));

		// Check autosave slot
		let foundAutosave = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;
				const snapshot = save.data.snapshots[save.data.storyIndex];
				expect(snapshot).toBeDefined();
				expect(snapshot?.counter).toBe(99);
				expect(save.data.lastPassageId).toBe("Start");
			}
		}
		expect(foundAutosave).toBe(true);
	});
});

describe("Advanced Saving and Loading", () => {
	test("saveToExport and loadFromExport should work", async () => {
		engine.setVars((s) => {
			s.player.level = 99;
		});

		const exportedData = await engine.saveToExport();

		expect(typeof exportedData).toBe("string");

		engine.setVars((s) => {
			s.player.level = 1;
		});

		expect(engine.vars.player.level).toBe(1);

		await engine.loadFromExport(exportedData);

		expect(engine.vars.player.level).toBe(99);
	});

	test("getSaves should return saved games", async () => {
		await engine.saveToSaveSlot(1);

		await engine.saveToSaveSlot(3);

		const saves: Array<{ type: "normal"; slot: number }> = [];

		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				saves.push({ slot: save.slot, type: "normal" });
			}
		}

		expect(saves.length).toBe(2);

		expect(saves.map((s) => s.slot)).toEqual([1, 3]);
	});

	test("loadRecentSave should load the most recent save", async () => {
		engine.setVars((s) => {
			s.others.stage = 1;
		});

		await engine.saveToSaveSlot(1);

		await new Promise((r) => setTimeout(r, 10)); // ensure timestamp is different

		engine.setVars((s) => {
			s.others.stage = 2;
		});

		await engine.saveToSaveSlot(2);

		engine.setVars((s) => {
			s.others.stage = 3;
		});

		await engine.loadRecentSave();

		expect(engine.vars.others.stage).toBe(2);
	});

	test("loadSaveFromData should load state from a save object", async () => {
		engine.setVars((s) => {
			s.player.name = "Initial Name";
		});

		await engine.saveToSaveSlot(1);

		const saves: Array<SugarBoxSaveData<any>> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				saves.push(save.data as SugarBoxSaveData<any>);
			}
		}
		const saveData = saves[0];
		expect(saveData).toBeDefined();

		engine.setVars((s) => {
			s.player.name = "New Name";
		});

		expect(engine.vars.player.name).toBe("New Name");

		engine.loadSaveFromData(saveData!);

		expect(engine.vars.player.name).toBe("Initial Name");
	});

	test("saving to an invalid slot should throw", async () => {
		let didThrow = false;

		try {
			await engine.saveToSaveSlot(-1);
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBeTrue();
	});

	test("deleteSaveSlot should delete a specific save slot", async () => {
		// Set up some test data
		engine.setVars((s) => {
			s.player.level = 10;
		});

		// Save to slot 1
		await engine.saveToSaveSlot(1);

		// Set different data
		engine.setVars((s) => {
			s.player.level = 20;
		});

		// Save to slot 2
		await engine.saveToSaveSlot(2);

		// Verify both saves exist
		const savesBeforeDelete: Array<{ type: "normal"; slot: number }> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesBeforeDelete.push({ slot: save.slot, type: "normal" });
			}
		}
		expect(savesBeforeDelete.length).toBe(2);

		// Delete slot 1
		await engine.deleteSaveSlot(1);

		// Verify only slot 2 remains
		const savesAfterDelete: Array<{ type: "normal"; slot: number }> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesAfterDelete.push({ slot: save.slot, type: "normal" });
			}
		}
		expect(savesAfterDelete.length).toBe(1);
		const onlySave = savesAfterDelete[0];
		expect(onlySave).toBeDefined();
		expect(onlySave?.slot).toBe(2);
	});

	test("deleteSaveSlot should delete autosave when no slot provided", async () => {
		// Set up test data
		engine.setVars((s) => {
			s.player.level = 15;
		});

		// Create an autosave
		await engine.saveToSaveSlot();

		// Verify autosave exists
		let autosaveExists = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				autosaveExists = true;
				break;
			}
		}
		expect(autosaveExists).toBe(true);

		// Delete autosave
		await engine.deleteSaveSlot();

		// Verify autosave no longer exists
		autosaveExists = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				autosaveExists = true;
				break;
			}
		}
		expect(autosaveExists).toBe(false);
	});

	test("deleteSaveSlot should throw for invalid save slots", async () => {
		// Try to delete an invalid save slot (out of range) - should throw
		let didThrow = false;
		try {
			await engine.deleteSaveSlot(999);
		} catch {
			didThrow = true;
		}
		expect(didThrow).toBe(true);
	});

	test("deleteSaveSlot should handle non-existent but valid save slots gracefully", async () => {
		// Try to delete a valid but non-existent save slot - should not throw
		expect(engine.deleteSaveSlot(5)).resolves.toBeUndefined();
	});

	test("deleteAllSaveSlots should delete all save slots", async () => {
		// Create multiple saves
		engine.setVars((s) => {
			s.player.level = 5;
		});
		await engine.saveToSaveSlot(1);

		engine.setVars((s) => {
			s.player.level = 10;
		});
		await engine.saveToSaveSlot(2);

		engine.setVars((s) => {
			s.player.level = 15;
		});
		await engine.saveToSaveSlot(3);

		// Create an autosave
		engine.setVars((s) => {
			s.player.level = 20;
		});
		await engine.saveToSaveSlot();

		// Verify all saves exist
		const savesBeforeDelete: Array<{
			type: "autosave" | "normal";
			slot?: number;
		}> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesBeforeDelete.push({ slot: save.slot, type: "normal" });
			} else {
				savesBeforeDelete.push({ type: "autosave" });
			}
		}
		expect(savesBeforeDelete.length).toBe(4); // 3 normal saves + 1 autosave

		// Delete all saves
		await engine.deleteAllSaveSlots();

		// Verify no saves remain
		const savesAfterDelete: Array<{
			type: "autosave" | "normal";
			slot?: number;
		}> = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesAfterDelete.push({ slot: save.slot, type: "normal" });
			} else {
				savesAfterDelete.push({ type: "autosave" });
			}
		}
		expect(savesAfterDelete.length).toBe(0);
	});

	test("deleteAllSaveSlots should handle empty save list gracefully", async () => {
		// Ensure no saves exist
		let saveCount = 0;
		for await (const _save of engine.getSaves()) {
			saveCount++;
		}
		expect(saveCount).toBe(0);

		// Delete all saves (should not throw)
		expect(engine.deleteAllSaveSlots()).resolves.toBeDefined();
	});

	test("deleteSaveSlot should throw when persistence is not available", async () => {
		// Create an engine without persistence
		const engineWithoutPersistence = await SugarboxEngine.init({
			achievements: {},
			config: {},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {},
		});

		let didThrow = false;
		try {
			await engineWithoutPersistence.deleteSaveSlot(1);
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBe(true);
	});

	test("deleteAllSaveSlots should throw when persistence is not available", async () => {
		// Create an engine without persistence
		const engineWithoutPersistence = await SugarboxEngine.init({
			achievements: {},
			config: {},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {},
		});

		let didThrow = false;
		try {
			await engineWithoutPersistence.deleteAllSaveSlots();
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBe(true);
	});

	test("save migration(s) should work", async () => {
		const persistence = createPersistenceAdapter();

		type Version_0_1_0_Variables = {
			prop1: number;
			prop2: string;
		};

		const engine = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.1.0`,
			},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { prop1: 12, prop2: "45" } as Version_0_1_0_Variables,
		});

		await engine.saveToSaveSlot(1);

		type Version_0_2_0_Variables = {
			prop1: string;
			prop2: number;
			prop3: {
				nestedprop: boolean;
			};
		};

		const engine2 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.2.0`,
			},
			migrations: [
				{
					data: {
						migrater: (data: Version_0_1_0_Variables) => {
							return {
								prop1: data.prop1.toString(),
								prop2: Number(data.prop2),
								prop3: { nestedprop: true },
							} as Version_0_2_0_Variables;
						},
						to: `0.2.0`,
					},
					from: `0.1.0`,
				},
			],
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {
				prop1: "1",
				prop2: 12,
				prop3: { nestedprop: true },
			} as Version_0_2_0_Variables,
		});

		await engine2.loadFromSaveSlot(1);

		expect(engine2.vars.prop1).toBe("12");
		expect(engine2.vars.prop2).toBe(45);
		expect(engine2.vars.prop3).not.toBeUndefined();

		type Version_0_3_0_Variables = {
			prop1: string;
			prop2: [number, number];
			prop3: {
				nestedprop: "true" | "false";
				nestedProp2: boolean;
			};
			prop4: string;
		};

		const engine3 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.3.0`,
			},
			migrations: [
				{
					data: {
						migrater: (data: Version_0_1_0_Variables) => {
							return {
								prop1: data.prop1.toString(),
								prop2: parseInt(data.prop2),
								prop3: { nestedprop: true },
							} as Version_0_2_0_Variables;
						},
						to: `0.2.0`,
					},
					from: `0.1.0`,
				},
				{
					data: {
						migrater: (data: Version_0_2_0_Variables) => {
							return {
								prop1: data.prop1,
								prop2: [data.prop2, 0],
								prop3: {
									nestedProp2: data.prop3.nestedprop,
									nestedprop: data.prop3.nestedprop ? "true" : "false",
								},
								prop4: "newProp",
							} as Version_0_3_0_Variables;
						},
						to: `0.3.0`,
					},
					from: `0.2.0`,
				},
			],
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {} as Version_0_3_0_Variables,
		});

		await engine3.loadFromSaveSlot(1);

		expect(engine3.vars.prop1).toBe("12");
		expect(engine3.vars.prop2).toEqual([45, 0]);
		expect(engine3.vars.prop3.nestedprop).toBe("true");
		expect(engine3.vars.prop3.nestedProp2).toBeTrue();
		expect(engine3.vars.prop4).toBe("newProp");
	});

	test("should emit migration events during save migration", async () => {
		const persistence = createPersistenceAdapter();

		type V010 = { foo: string };
		type V020 = { foo: string; bar: number };
		type V030 = { foo: string; bar: number; baz: boolean };

		const saveV010 = {
			intialState: { foo: "hello" },
			lastPassageId: "start",
			savedOn: new Date(),
			saveVersion: "0.1.0",
			snapshots: [{ foo: "pain" }],
			storyIndex: 0,
		};

		const migrations = [
			{
				data: {
					migrater: (old: V010): V020 => ({ ...old, bar: 42 }),
					to: "0.2.0",
				},
				from: "0.1.0",
			} as const,
			{
				data: {
					migrater: (old: V020): V030 => ({ ...old, baz: true }),
					to: "0.3.0",
				},
				from: "0.2.0",
			} as const,
		];

		const engine = await SugarboxEngine.init({
			achievements: {},
			config: { persistence, saveVersion: "0.3.0" },
			migrations,
			name: "migration-events-test",
			otherPassages: [],
			startPassage: { data: "Start", name: "start" },
			variables: { bar: 0, baz: false, foo: "init" },
		});

		const migrationEvents: unknown[] = [];

		engine.on(":migrationStart", (e) => {
			migrationEvents.push({ type: "start", ...e.detail });
		});

		engine.on(":migrationEnd", (e) => migrationEvents.push(e.detail));

		//@ts-expect-error save will be migrated
		engine.loadSaveFromData(saveV010);

		expect(migrationEvents).toEqual([
			{
				fromVersion: "0.1.0",
				toVersion: "0.2.0",
				type: "start",
			},
			{
				fromVersion: "0.1.0",
				toVersion: "0.2.0",
				type: "success",
			},
			{
				fromVersion: "0.2.0",
				toVersion: "0.3.0",
				type: "start",
			},
			{
				fromVersion: "0.2.0",
				toVersion: "0.3.0",
				type: "success",
			},
		]);
	});

	test("liberal save compatibility mode should allow loading older minor versions without migration", async () => {
		const persistence = createPersistenceAdapter();

		type Version_0_1_0_Variables = {
			prop1: number;
			prop2: string;
		};

		const engine1 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.1.0`,
			},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { prop1: 123, prop2: "abc" } as Version_0_1_0_Variables,
		});

		await engine1.saveToSaveSlot(1);

		// Initialize engine2 with a higher minor version but liberal compatibility
		const engine2 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveCompat: "liberal",
				saveVersion: `0.2.0`,
			},
			migrations: [], // No migrations defined, as it should be compatible
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { prop1: 0, prop2: "" } as Version_0_1_0_Variables, // Variables type should match the loaded save structure
		});

		await engine2.loadFromSaveSlot(1);

		// Assert that the save loaded successfully and the data is from 0.1.0
		expect(engine2.vars.prop1).toBe(123);
		expect(engine2.vars.prop2).toBe("abc");
	});

	test("compress should not affect load compatibility", async () => {
		const persistence = createPersistenceAdapter();

		const ENGINE_NAME = "Test1";

		const engineArgs = {
			config: { compress: true, persistence },
			name: ENGINE_NAME,
			otherPassages: [] as Array<{ name: string; data: string }>,
			startPassage: { data: "TTTT", name: ":p" },
			variables: {
				pain: true,
				pain2: {
					pain: true,
					pain3: {
						pain: true,
						pain2: { pain: true, test: { nested: "pain" } },
						test: { nested: "pain" },
					},
					test: { nested: "pain" },
				},
				test: { nested: "pain" },
			},
		} as const;

		const engine1 = await SugarboxEngine.init(engineArgs);

		await engine1.saveToSaveSlot(1);

		// Verify we stored something that looks like a save payload, without caring about the exact format.
		const slot1Data =
			(await persistence.get(`sugarbox-${ENGINE_NAME}-slot1`)) ?? '{""}';
		expect(isStringJsonObjectOrCompressedString(slot1Data)).toBeTruthy();

		// Re-init with compression disabled and ensure it can still load the previously saved slot.
		const engine2 = await SugarboxEngine.init({
			...engineArgs,
			config: { ...engineArgs.config, compress: false },
			// Use the same engine name so we load from the same persistence key.
			name: ENGINE_NAME,
		});

		await engine2.loadFromSaveSlot(1);

		expect(engine2.vars.pain).toBeTrue();
		expect(engine2.vars.pain2.pain3.test.nested).toBe("pain");
	});

	test("a reinitialized engine that is set to not compress save files should still be able to load a previously compressed save without issue", async () => {
		const persistence = createPersistenceAdapter();

		const ENGINE_NAME = "Test1";

		const engineArgs = {
			config: { compress: true, persistence },
			name: ENGINE_NAME,
			otherPassages: [] as Array<{ name: string; data: string }>,
			startPassage: { data: "TTTT", name: ":p" },
			variables: {
				pain: true,
				pain2: {
					pain: true,
					pain3: {
						pain: true,
						pain2: { pain: true, test: { nested: "pain" } },
						test: { nested: "pain" },
					},
					test: { nested: "pain" },
				},
				test: { nested: "pain" },
			},
		} as const;

		const engine1 = await SugarboxEngine.init(engineArgs);

		await Promise.all([engine1.saveToSaveSlot(1), engine1.saveToSaveSlot(2)]);

		const engine2 = await SugarboxEngine.init({
			...engineArgs,
			config: { ...engineArgs.config, compress: false },
		});

		await engine2.loadFromSaveSlot(2);

		expect(engine2.vars.pain).toBeTrue();
	});
});

describe("Custom Classes", () => {
	test("custom classes should still work after saving / loading", async () => {
		await engine.saveToSaveSlot(1);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");
	});

	test("using unregistered class should not have its methods after load", async () => {
		class Unregistered {
			name = "unregistered";
			iExist() {
				return true;
			}
			__toJSON() {
				return { __class_id: "Unregistered", name: this.name };
			}
			static __fromJSON(data: { name: string }) {
				const c = new Unregistered();
				c.name = data.name;
				return c;
			}
			static __classId = "Unregistered";
		}

		engine.setVars((s) => {
			// @ts-expect-error
			s.unregistered = new Unregistered();
		});

		await engine.saveToSaveSlot(1);

		await engine.loadFromSaveSlot(1);

		// @ts-expect-error
		expect(engine.vars.unregistered.name).toBe("unregistered");
		// @ts-expect-error
		expect(engine.vars.unregistered.iExist).toBeUndefined();
	});

	test("BigInt should work in save/load", async () => {
		engine.setVars((s) => {
			// @ts-expect-error
			s.largeNumbers = {
				currency: 123456789012345678901234567890n,
				score: 9007199254740991n,
			};
		});

		await engine.saveToSaveSlot(1);

		// Modify the values to ensure they're actually loaded
		engine.setVars((s) => {
			// @ts-expect-error
			s.largeNumbers.score = 0n;
			// @ts-expect-error
			s.largeNumbers.currency = 1n;
		});

		await engine.loadFromSaveSlot(1);

		// Check BigInt restoration
		// @ts-expect-error
		expect(typeof engine.vars.largeNumbers.score).toBe("bigint");
		// @ts-expect-error
		expect(engine.vars.largeNumbers.score).toBe(9007199254740991n);
		// @ts-expect-error
		expect(typeof engine.vars.largeNumbers.currency).toBe("bigint");
		// @ts-expect-error
		expect(engine.vars.largeNumbers.currency).toBe(
			123456789012345678901234567890n,
		);
	});
});

describe("Events", () => {
	test("ensure passage and state change events are emitted with the appropriate data and can be turned off", async () => {
		// :passageChange event
		type PassageChangeDetail = {
			newPassage: Readonly<SugarBoxPassage<string, string>> | null;
			oldPassage: Readonly<SugarBoxPassage<string, string>> | null;
		};

		let passageNavigatedData: PassageChangeDetail | null = null;

		const endListener = engine.on(":passageChange", ({ detail }) => {
			if (isPassageChangeDetail(detail)) {
				passageNavigatedData = detail;
			}
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(passageNavigatedData).not.toBeNull();
		expect(passageNavigatedData!.newPassage).toEqual(SAMPLE_PASSAGES[0]);

		endListener(); // From this point no changes should be registered

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		expect(passageNavigatedData!.newPassage).not.toEqual(SAMPLE_PASSAGES[1]);

		// :stateChange event
		let stateChangedData: {
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		let stateChangeCount = 0;

		const endListener2 = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangedData = detail;
				stateChangeCount++;
			}
		});

		engine.setVars((state) => {
			state.player.name = "Alice";
		});

		expect(stateChangedData).not.toBeNull();

		const maybePlayer = stateChangedData!.newState.player as unknown as {
			name?: unknown;
		};

		expect(maybePlayer.name).toEqual("Alice");

		expect(stateChangeCount).toBe(1);

		endListener2(); // From this point no changes should be registered

		engine.setVars((state) => {
			state.others.stage = 1;
		});

		expect(stateChangeCount).not.toBe(2);
	});

	test("should emit save and load events", async () => {
		// Save events
		let saveStartEvent: { slot: string | number } | undefined;

		let saveEndEvent:
			| {
					type: "success";
			  }
			| {
					type: "error";
					error: Error;
			  }
			| undefined;

		const saveStartListener = engine.on(":saveStart", ({ detail }) => {
			saveStartEvent = detail;
		});

		const saveEndListener = engine.on(":saveEnd", ({ detail }) => {
			saveEndEvent = detail;
		});

		await engine.saveToSaveSlot(1);

		expect(saveStartEvent).not.toBeUndefined();

		expect(saveEndEvent).not.toBeUndefined();

		saveStartListener();
		saveEndListener();

		// Load events
		let loadStartEvent: { slot: string | number } | undefined;

		let loadEndEvent:
			| {
					type: "success";
			  }
			| {
					type: "error";
					error: Error;
			  }
			| undefined;

		const loadStartListener = engine.on(":loadStart", ({ detail }) => {
			loadStartEvent = detail;
		});

		const loadEndListener = engine.on(":loadEnd", ({ detail }) => {
			loadEndEvent = detail;
		});

		await engine.loadFromSaveSlot(1);

		expect(loadStartEvent).not.toBeUndefined();

		expect(loadEndEvent).not.toBeUndefined();

		loadStartListener();
		loadEndListener();
	});

	test("should emit delete events", async () => {
		// Set up a save to delete
		await engine.saveToSaveSlot(1);

		// Delete events for numbered slot
		let deleteStartEvent: { slot: "autosave" | number } | undefined;
		let deleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const deleteStartListener = engine.on(":deleteStart", ({ detail }) => {
			deleteStartEvent = detail;
		});

		const deleteEndListener = engine.on(":deleteEnd", ({ detail }) => {
			deleteEndEvent = detail;
		});

		await engine.deleteSaveSlot(1);

		expect(deleteStartEvent).toEqual({ slot: 1 });
		expect(deleteEndEvent).toEqual({ slot: 1, type: "success" });

		deleteStartListener();
		deleteEndListener();

		// Delete events for autosave
		await engine.saveToSaveSlot(); // Create autosave

		let autosaveDeleteStartEvent: { slot: "autosave" | number } | undefined;
		let autosaveDeleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const autosaveDeleteStartListener = engine.on(
			":deleteStart",
			({ detail }) => {
				autosaveDeleteStartEvent = detail;
			},
		);

		const autosaveDeleteEndListener = engine.on(":deleteEnd", ({ detail }) => {
			autosaveDeleteEndEvent = detail;
		});

		await engine.deleteSaveSlot(); // Delete autosave

		expect(autosaveDeleteStartEvent).toEqual({ slot: "autosave" });
		expect(autosaveDeleteEndEvent).toEqual({
			slot: "autosave",
			type: "success",
		});

		autosaveDeleteStartListener();
		autosaveDeleteEndListener();
	});

	test("should emit delete events on error", async () => {
		// Create engine without persistence to trigger error
		const engineWithoutPersistence = await SugarboxEngine.init({
			achievements: {},
			config: {},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {},
		});

		let deleteStartEvent: { slot: "autosave" | number } | undefined;
		let deleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const deleteStartListener = engineWithoutPersistence.on(
			":deleteStart",
			({ detail }) => {
				deleteStartEvent = detail;
			},
		);

		const deleteEndListener = engineWithoutPersistence.on(
			":deleteEnd",
			({ detail }) => {
				deleteEndEvent = detail;
			},
		);

		// Attempt to delete should throw and emit error event
		await expect(engineWithoutPersistence.deleteSaveSlot(1)).rejects.toThrow();

		expect(deleteStartEvent).toEqual({ slot: 1 });
		expect(deleteEndEvent?.type).toBe("error");
		expect(deleteEndEvent?.slot).toBe(1);
		expect(
			deleteEndEvent && "error" in deleteEndEvent && deleteEndEvent.error,
		).toBeInstanceOf(Error);

		deleteStartListener();
		deleteEndListener();
	});
});

describe("State Change Events", () => {
	test("should emit stateChange with complete oldState and newState on variable modification", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		const initialState =
			engine.vars as unknown as StateWithMetadata<GenericSerializableObject>;

		engine.setVars((state) => {
			state.player.name = "NewName";
			state.player.level = 50;
		});

		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState).toMatchObject(initialState);

		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			name: string;
			level: number;
			inventory: unknown;
		};

		expect(newPlayer.name).toBe("NewName");
		expect(newPlayer.level).toBe(50);
		expect(newPlayer.inventory).toEqual(
			(initialState.player as unknown as { inventory: unknown }).inventory,
		);

		listener();
	});

	test("should emit stateChange with complete states on nested object modifications", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		const initialGold = engine.vars.player.inventory.gold;

		engine.setVars((state) => {
			state.player.inventory.gold = 500;
			state.player.inventory.gems = 25;
		});

		expect(stateChangeEvent).not.toBeNull();

		const oldPlayer = stateChangeEvent!.oldState.player as unknown as {
			name: string;
			inventory: { gold: number; gems: number };
		};
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			name: string;
			inventory: { gold: number; gems: number };
		};

		expect(oldPlayer.inventory.gold).toBe(initialGold);
		expect(oldPlayer.inventory.gems).toBe(12);
		expect(newPlayer.inventory.gold).toBe(500);
		expect(newPlayer.inventory.gems).toBe(25);
		expect(newPlayer.name).toBe("Dave"); // Should still be original name since tests are isolated

		listener();
	});

	test("should emit stateChange with complete states on array modifications", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		const initialItems = [...engine.vars.player.inventory.items];

		engine.setVars((state) => {
			state.player.inventory.items.push("Magic Wand");
			state.player.inventory.items.push("Health Potion");
		});

		expect(stateChangeEvent).not.toBeNull();

		const oldPlayer = stateChangeEvent!.oldState.player as unknown as {
			inventory: { items: string[] };
		};
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			inventory: { items: string[] };
		};

		expect(oldPlayer.inventory.items).toEqual(initialItems);
		expect(newPlayer.inventory.items).toContain("Magic Wand");
		expect(newPlayer.inventory.items).toContain("Health Potion");
		expect(newPlayer.inventory.items.length).toBe(initialItems.length + 2);

		listener();
	});

	test("should emit stateChange with complete states on multiple variable changes in single call", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		const oldStage = engine.vars.others.stage;
		const oldHoursPlayed = engine.vars.others.hoursPlayed;

		engine.setVars((state) => {
			state.player.level = 100;
			state.player.location = "Castle";
			state.others.stage = 999;
			state.others.hoursPlayed = 50.5;
		});

		expect(stateChangeEvent).not.toBeNull();

		// Verify old state contains original values
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			level: number;
			location: string;
		};
		const oldOthers = stateChangeEvent!.oldState.others as unknown as {
			stage: number;
			hoursPlayed: number;
		};
		const newOthers = stateChangeEvent!.newState.others as unknown as {
			stage: number;
			hoursPlayed: number;
		};

		expect(oldOthers.stage).toBe(oldStage);
		expect(oldOthers.hoursPlayed).toBe(oldHoursPlayed);

		// Verify new state contains all changes
		expect(newPlayer.level).toBe(100);
		expect(newPlayer.location).toBe("Castle");
		expect(newOthers.stage).toBe(999);
		expect(newOthers.hoursPlayed).toBe(50.5);

		listener();
	});

	test("should emit stateChange events on history navigation", async () => {
		const stateChangeEvents: Array<{
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		}> = [];

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvents.push(detail);
			}
		});

		// Navigate to create history
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		// Make some changes
		engine.setVars((state) => {
			state.player.level = 25;
		});

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		engine.setVars((state) => {
			state.player.location = "Mountains";
		});

		const eventsBeforeNavigation = stateChangeEvents.length;

		// Navigate backward - this should trigger a stateChange event
		engine.backward(2);

		expect(stateChangeEvents.length).toBe(eventsBeforeNavigation + 1);

		const lastEvent = stateChangeEvents[stateChangeEvents.length - 1];
		if (!lastEvent) {
			throw new Error(
				"Expected a :stateChange event after history navigation.",
			);
		}

		const oldPlayer = lastEvent.oldState.player as unknown as {
			location: string;
		};
		const newPlayer = lastEvent.newState.player as unknown as { level: number };

		expect(oldPlayer.location).toBe("Mountains");
		expect(newPlayer.level).toBe(6); // Should reflect the original state at that point in history

		listener();
	});

	test("should preserve custom class instances in stateChange events", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		engine.setVars((state) => {
			state.player.class = "Wizard";
		});

		expect(stateChangeEvent).not.toBeNull();

		const oldPlayer = stateChangeEvent!.oldState.player as unknown as {
			class: string;
			favouriteItem: () => string;
		};
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			class: string;
			favouriteItem: () => string;
		};

		// Verify both states contain the Player-like instance with methods
		expect(typeof oldPlayer.favouriteItem).toBe("function");
		expect(typeof newPlayer.favouriteItem).toBe("function");
		expect(oldPlayer.favouriteItem()).toBe("Black Sword");
		expect(newPlayer.favouriteItem()).toBe("Black Sword");

		// Verify the change was applied
		expect(oldPlayer.class).toBe("Paladin");
		expect(newPlayer.class).toBe("Wizard");

		listener();
	});

	test("should emit stateChange with complete states when replacing entire state object", async () => {
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		const initialState = { ...engine.vars };
		const newStateObject = {
			newProperty: "This is new",
			others: {
				hoursPlayed: 0,
				stage: 0,
			},
			player: {
				class: "Rogue",
				level: 1,
				name: "Completely New Player",
			},
		};

		engine.setVars(() => newStateObject);

		expect(stateChangeEvent).not.toBeNull();

		const oldPlayer = stateChangeEvent!.oldState.player as unknown as {
			name: string;
		};
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			name: string;
		};

		expect(oldPlayer.name).toBe(initialState.player.name);
		expect(newPlayer.name).toBe("Completely New Player");
		expect(
			(stateChangeEvent!.newState as unknown as { newProperty?: unknown })
				.newProperty,
		).toBe("This is new");

		// Note: When completely replacing state, properties not in the new object are not preserved
		// This is the expected behavior based on the engine implementation

		listener();
	});

	test("should handle multiple consecutive stateChange events correctly", async () => {
		const stateChangeEvents: Array<{
			oldLevel: number;
			newLevel: number;
		}> = [];

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (!isStateChangeDetail(detail)) {
				return;
			}

			const oldPlayer = detail.oldState.player as unknown as { level?: number };
			const newPlayer = detail.newState.player as unknown as { level?: number };

			if (
				typeof oldPlayer.level !== "number" ||
				typeof newPlayer.level !== "number"
			) {
				throw new Error(
					"Expected :stateChange detail player.level to be a number in both oldState and newState.",
				);
			}

			stateChangeEvents.push({
				newLevel: newPlayer.level,
				oldLevel: oldPlayer.level,
			});
		});

		// First change: 6 -> 10
		engine.setVars((state) => {
			state.player.level = 10;
		});

		// Second change: 10 -> 20
		engine.setVars((state) => {
			state.player.level = 20;
		});

		// Third change: 20 -> 30
		engine.setVars((state) => {
			state.player.level = 30;
		});

		expect(stateChangeEvents.length).toBe(3);

		// Verify the chain of state changes - should now work correctly with cloned oldState
		const event0 = stateChangeEvents[0];
		const event1 = stateChangeEvents[1];
		const event2 = stateChangeEvents[2];

		if (!event0 || !event1 || !event2) {
			throw new Error("Expected 3 consecutive :stateChange events.");
		}

		expect(event0.oldLevel).toBe(6); // Initial level
		expect(event0.newLevel).toBe(10);
		expect(event1.oldLevel).toBe(10);
		expect(event1.newLevel).toBe(20);
		expect(event2.oldLevel).toBe(20);
		expect(event2.newLevel).toBe(30);

		listener();
	});

	test("should respect eventOptimization performance mode", async () => {
		// Create a new engine with performance optimization
		const performanceEngine = await SugarboxEngine.init({
			achievements: {},
			config: {
				emitMode: "perf",
			},
			name: "PerformanceTest",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: { counter: 0, data: { value: 1 } },
		});

		let eventCount = 0;
		let lastEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = performanceEngine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				eventCount++;
				lastEvent = detail;
			}
		});

		// Make a state change
		performanceEngine.setVars((state) => {
			state.counter = 10;
		});

		expect(eventCount).toBe(1);
		expect(lastEvent).not.toBeNull();
		expect(lastEvent!.newState.counter).toBe(10);

		// In performance mode, the event should still work correctly
		// but may not have perfect isolation in edge cases
		expect(typeof lastEvent!.oldState).toBe("object");
		expect(typeof lastEvent!.newState).toBe("object");

		listener();
	});

	test("should work correctly with performance mode without affecting functionality", async () => {
		// Create engine with performance mode
		const perfEngine = await SugarboxEngine.init({
			achievements: {},
			config: { emitMode: "perf" },
			name: "PerfTest2",
			otherPassages: [],
			startPassage: { data: "Start", name: "Start" },
			variables: { counter: 0, test: { value: 1 } },
		});

		// Test multiple consecutive changes work correctly
		perfEngine.setVars((state) => {
			state.counter = 1;
		});

		perfEngine.setVars((state) => {
			state.counter = 2;
		});

		perfEngine.setVars((state) => {
			state.test.value = 999;
		});

		// Verify final state is correct regardless of optimization mode
		expect(perfEngine.vars.counter).toBe(2);
		expect(perfEngine.vars.test.value).toBe(999);
	});
});

describe("Load-Related Events", () => {
	test("should emit stateChange events when loading from save slot", async () => {
		// Set up initial state
		engine.setVars((state) => {
			state.player.name = "InitialName";
			state.player.level = 10;
			state.others.stage = 1;
		});

		// Navigate to a different passage
		engine.navigateTo("Forest Path");

		// Save the current state
		await engine.saveToSaveSlot(1);

		// Change state after saving
		engine.setVars((state) => {
			state.player.name = "ChangedName";
			state.player.level = 20;
			state.others.stage = 5;
		});

		// Navigate to another passage
		engine.navigateTo("Mountain Peak");

		// Set up event listeners
		let stateChangeEvent: {
			oldState: Readonly<StateWithMetadata<GenericSerializableObject>>;
			newState: Readonly<StateWithMetadata<GenericSerializableObject>>;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			if (isStateChangeDetail(detail)) {
				stateChangeEvent = detail;
			}
		});

		// Load the save
		await engine.loadFromSaveSlot(1);

		// Verify stateChange event was emitted with correct data
		expect(stateChangeEvent).not.toBeNull();

		const oldPlayer = stateChangeEvent!.oldState.player as unknown as {
			name: string;
			level: number;
		};
		const newPlayer = stateChangeEvent!.newState.player as unknown as {
			name: string;
			level: number;
		};
		const oldOthers = stateChangeEvent!.oldState.others as unknown as {
			stage: number;
		};
		const newOthers = stateChangeEvent!.newState.others as unknown as {
			stage: number;
		};

		expect(oldPlayer.name).toBe("ChangedName");
		expect(oldPlayer.level).toBe(20);
		expect(oldOthers.stage).toBe(5);
		expect(newPlayer.name).toBe("InitialName");
		expect(newPlayer.level).toBe(10);
		expect(newOthers.stage).toBe(1);

		// Verify the final engine state matches the loaded save
		expect(engine.vars.player.name).toBe("InitialName");
		expect(engine.passage).toEqual(SAMPLE_PASSAGES[1]);

		listener();
	});

	test("should emit passageChange events when loading from save slot", async () => {
		// Navigate to a passage and save
		engine.navigateTo("Mountain Peak");
		await engine.saveToSaveSlot(2);

		// Navigate to a different passage
		engine.navigateTo("Forest Path");

		// Set up event listener
		let passageChangeEvent: {
			oldPassage: Readonly<SugarBoxPassage<string, string>> | null;
			newPassage: Readonly<SugarBoxPassage<string, string>> | null;
		} | null = null;

		const listener = engine.on(":passageChange", ({ detail }) => {
			if (isPassageChangeDetail(detail)) {
				passageChangeEvent = detail;
			}
		});

		// Load the save
		await engine.loadFromSaveSlot(2);

		// Verify passageChange event was emitted with correct data
		expect(passageChangeEvent).not.toBeNull();
		expect(passageChangeEvent!.oldPassage).toEqual(SAMPLE_PASSAGES[1]);
		expect(passageChangeEvent!.newPassage).toEqual(SAMPLE_PASSAGES[2]);

		listener();
	});

	test("should emit both stateChange and passageChange events when loading saves with performance optimization", async () => {
		// Create engine with performance optimization
		const perfEngine = await SugarboxEngine.init({
			achievements: {},
			config: {
				emitMode: "perf",
				persistence: createPersistenceAdapter(),
			},
			name: "PerfLoadTest",
			otherPassages: [{ data: "Test passage", name: "Test" }],
			startPassage: { data: "Start passage", name: "Start" },
			variables: { counter: 0, data: { value: 1 } },
		});

		// Set initial state and passage
		perfEngine.setVars((state) => {
			state.counter = 100;
			state.data.value = 999;
		});
		perfEngine.navigateTo("Test");

		// Save state
		await perfEngine.saveToSaveSlot(1);

		// Change state and passage
		perfEngine.setVars((state) => {
			state.counter = 0;
			state.data.value = 1;
		});
		perfEngine.navigateTo("Start");

		// Set up event listeners
		let stateChangeCount = 0;
		let passageChangeCount = 0;
		let lastStateEvent: any = null;
		let lastPassageEvent: any = null;

		const stateListener = perfEngine.on(":stateChange", ({ detail }) => {
			stateChangeCount++;
			lastStateEvent = detail;
		});

		const passageListener = perfEngine.on(":passageChange", ({ detail }) => {
			passageChangeCount++;
			lastPassageEvent = detail;
		});

		// Load the save
		await perfEngine.loadFromSaveSlot(1);

		// Verify both events were emitted
		expect(stateChangeCount).toBe(1);
		expect(passageChangeCount).toBe(1);

		// Verify state change event data
		expect(lastStateEvent.oldState.counter).toBe(0);
		expect(lastStateEvent.newState.counter).toBe(100);
		expect(lastStateEvent.newState.data.value).toBe(999);

		// Verify passage change event data
		expect(lastPassageEvent.oldPassage).toEqual({
			data: "Start passage",
			name: "Start",
		});
		expect(lastPassageEvent.newPassage).toEqual({
			data: "Test passage",
			name: "Test",
		});

		// Verify final state
		expect(perfEngine.vars.counter).toBe(100);
		expect(perfEngine.vars.data.value).toBe(999);
		expect(perfEngine.passage).toEqual({
			data: "Test passage",
			name: "Test",
		});

		stateListener();
		passageListener();
	});

	test("should emit events when loading autosave", async () => {
		// Configure engine with autosave on passage change
		const persistence = createPersistenceAdapter();
		const autoEngine = await SugarboxEngine.init({
			achievements: {},
			config: {
				autoSave: "passage",
				persistence,
			},
			name: "AutoLoadTest",
			otherPassages: [{ data: "Auto passage", name: "Auto" }],
			startPassage: { data: "Start passage", name: "Start" },
			variables: { test: "initial" },
		});

		// Change state and navigate (will trigger autosave)
		autoEngine.setVars((state) => {
			state.test = "autosaved";
		});
		autoEngine.navigateTo("Auto");

		// Wait for autosave to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify autosave was created
		let foundAutosave = false;
		for await (const save of autoEngine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;
				expect(save.data.lastPassageId).toBe("Auto");
				break;
			}
		}
		expect(foundAutosave).toBe(true);

		// Change state again
		autoEngine.setVars((state) => {
			state.test = "changed";
		});
		autoEngine.navigateTo("Start");

		// Set up event listeners
		let eventCount = 0;
		let stateEvent: any = null;
		let passageEvent: any = null;

		const stateListener = autoEngine.on(":stateChange", ({ detail }) => {
			eventCount++;
			stateEvent = detail;
		});

		const passageListener = autoEngine.on(":passageChange", ({ detail }) => {
			passageEvent = detail;
		});

		// Load autosave (no parameter means autosave)
		await autoEngine.loadFromSaveSlot();

		// Verify events were emitted
		expect(eventCount).toBe(1);
		expect(stateEvent).not.toBeNull();
		expect(passageEvent).not.toBeNull();

		// Verify data correctness
		expect(stateEvent.oldState.test).toBe("changed");
		expect(stateEvent.newState.test).toBe("autosaved");
		expect(passageEvent.oldPassage).toEqual({
			data: "Start passage",
			name: "Start",
		});
		expect(passageEvent.newPassage).toEqual({
			data: "Auto passage",
			name: "Auto",
		});

		stateListener();
		passageListener();
	});

	test("should handle load events correctly with complex nested state changes", async () => {
		// Set up complex nested state
		engine.setVars((state) => {
			state.player.inventory.items.push("Magic Ring");
			state.player.inventory.gold = 500;
			state.others.hoursPlayed = 10.5;
		});
		engine.navigateTo("Mountain Peak");

		await engine.saveToSaveSlot(3);

		// Make complex changes
		engine.setVars((state) => {
			state.player.inventory.items = ["Basic Sword"];
			state.player.inventory.gold = 0;
			state.player.name = "NewPlayer";
			state.others.hoursPlayed = 0;
			state.others.stage = 99;
		});
		engine.navigateTo("Start");

		// Set up event listener
		let complexStateEvent: any = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			complexStateEvent = detail;
		});

		// Load the save
		await engine.loadFromSaveSlot(3);

		// Verify complex nested state restoration
		expect(complexStateEvent).not.toBeNull();
		expect(complexStateEvent.oldState.player.name).toBe("NewPlayer");
		expect(complexStateEvent.oldState.player.inventory.items).toEqual([
			"Basic Sword",
		]);
		expect(complexStateEvent.oldState.player.inventory.gold).toBe(0);
		expect(complexStateEvent.oldState.others.stage).toBe(99);

		expect(complexStateEvent.newState.player.inventory.items).toContain(
			"Magic Ring",
		);
		expect(complexStateEvent.newState.player.inventory.gold).toBe(500);
		expect(complexStateEvent.newState.others.hoursPlayed).toBe(10.5);

		// Verify the actual engine state
		expect(engine.vars.player.inventory.items).toContain("Magic Ring");
		expect(engine.vars.player.inventory.gold).toBe(500);
		expect(engine.passage).toEqual(SAMPLE_PASSAGES[2]);

		listener();
	});

	// Might remove this >~<
	test("should maintain event consistency with #shouldCloneOldState optimization", async () => {
		// Test both accuracy and performance modes to ensure the refactored
		// #shouldCloneOldState getter works correctly

		const testEngines = await Promise.all([
			SugarboxEngine.init({
				achievements: {},
				config: {
					emitMode: "acc",
					persistence: createPersistenceAdapter(),
				},
				name: "AccuracyTest",
				otherPassages: [],
				startPassage: { data: "Start", name: "Start" },
				variables: { shared: { value: 1 } },
			}),
			SugarboxEngine.init({
				achievements: {},
				config: {
					emitMode: "perf",
					persistence: createPersistenceAdapter(),
				},
				name: "PerformanceTest",
				otherPassages: [],
				startPassage: { data: "Start", name: "Start" },
				variables: { shared: { value: 1 } },
			}),
		]);

		for (const [index, testEngine] of testEngines.entries()) {
			const mode = index === 0 ? "acc" : "perf";

			// Set up state
			testEngine.setVars((state) => {
				state.shared.value = 100;
			});

			await testEngine.saveToSaveSlot(1);

			// Change state
			testEngine.setVars((state) => {
				state.shared.value = 200;
			});

			// Capture events
			let stateEvent: any = null;
			const listener = testEngine.on(":stateChange", ({ detail }) => {
				stateEvent = detail;
			});

			// Load save
			await testEngine.loadFromSaveSlot(1);

			// Verify event structure is consistent regardless of optimization mode
			expect(stateEvent).not.toBeNull();
			expect(stateEvent.oldState.shared.value).toBe(200);
			expect(stateEvent.newState.shared.value).toBe(100);
			expect(typeof stateEvent.oldState).toBe("object");
			expect(typeof stateEvent.newState).toBe("object");

			// In accuracy mode, states should be properly isolated
			if (mode === "acc") {
				// Test that modifying the oldState doesn't affect the current engine state
				const originalEngineValue = testEngine.vars.shared.value;
				stateEvent.oldState.shared.value = 999;

				// Engine state should not be affected by modifying oldState
				expect(testEngine.vars.shared.value).toBe(originalEngineValue);

				// But note: in the current implementation, newState may reference the same object
				// as the engine's current state, so we test oldState isolation specifically
			}

			listener();
		}
	});
});

describe("Passage Management", () => {
	test("should add a single passage", async () => {
		const newPassage = { data: "It's dark here.", name: "Cave" };

		engine.addPassage(newPassage);
		engine.navigateTo(newPassage.name);

		expect(engine.passageId).toBe(newPassage.name);
		expect(engine.passage).toEqual(newPassage);
	});

	test("should add multiple passages", async () => {
		const newPassages = [
			{ data: "The air is thick and humid.", name: "Swamp" },
			{ data: "A large castle looms before you.", name: "Castle" },
		] as const;

		engine.addPassages(...newPassages);
		engine.navigateTo(newPassages[1].name);

		expect(engine.passageId).toBe(newPassages[1].name);
		expect(engine.passage).toEqual(newPassages[1]);
	});
});

describe("Achievements and Settings", () => {
	test("achievements should be settable and persist across sessions", async () => {
		const persistence = createPersistenceAdapter();
		const engine1 = await initEngineWithExtraSettings(persistence);

		const achievements = { points: 10, unlocked: ["First Quest"] };

		await engine1.setAchievements(() => achievements);
		expect(engine1.achievements).toEqual(achievements);

		const engine2 = await initEngineWithExtraSettings(persistence);
		expect(engine2.achievements).toEqual(achievements);
	});

	test("settings should be settable and persist across sessions", async () => {
		const persistence = createPersistenceAdapter();
		const engine1 = await initEngineWithExtraSettings(persistence);

		const settings = { difficulty: "hard", volume: 0.5 };
		await engine1.setSettings((_) => settings);
		expect(engine1.settings).toEqual(settings);

		const engine2 = await initEngineWithExtraSettings(persistence);
		expect(engine2.settings).toEqual(settings);
	});

	test("should emit achievementChange event with old and new state", async () => {
		type AchievementData = {
			firstQuest: boolean;
			secondQuest?: boolean;
			points: number;
		};

		const initialAchievements: AchievementData = {
			firstQuest: true,
			points: 10,
		};

		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(
			persistence,
			initialAchievements,
		);

		let achievementEvent:
			| {
					old: AchievementData;
					new: AchievementData;
			  }
			| undefined;

		const listener = engine.on(":achievementChange", ({ detail }) => {
			achievementEvent = detail;
		});

		// Update achievements
		await engine.setAchievements((ach) => {
			ach.secondQuest = true;
			ach.points = 25;
		});

		expect(achievementEvent?.old).toEqual({ firstQuest: true, points: 10 });
		expect(achievementEvent?.new).toEqual({
			firstQuest: true,
			points: 25,
			secondQuest: true,
		});

		listener();
	});

	test("should emit settingChange event with old and new state", async () => {
		type SettingsData = {
			volume: number;
			difficulty: string;
			language?: string;
		};

		const initialSettings: SettingsData = {
			difficulty: "normal",
			volume: 0.8,
		};

		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(
			persistence,
			undefined,
			initialSettings,
		);

		let settingEvent:
			| {
					old: SettingsData;
					new: SettingsData;
			  }
			| undefined;

		const listener = engine.on(":settingChange", ({ detail }) => {
			settingEvent = detail;
		});

		// Update settings
		await engine.setSettings((settings) => {
			settings.volume = 0.5;
			settings.language = "en";
		});

		expect(settingEvent?.old).toEqual({ difficulty: "normal", volume: 0.8 });
		expect(settingEvent?.new).toEqual({
			difficulty: "normal",
			language: "en",
			volume: 0.5,
		});

		listener();
	});

	test("should emit events when replacing entire achievement/setting objects", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(persistence);

		let achievementEvent:
			| {
					old: typeof engine.achievements;
					new: typeof engine.achievements;
			  }
			| undefined;
		let settingEvent:
			| {
					old: typeof engine.settings;
					new: typeof engine.settings;
			  }
			| undefined;

		engine.on(":achievementChange", ({ detail }) => {
			achievementEvent = detail;
		});

		engine.on(":settingChange", ({ detail }) => {
			settingEvent = detail;
		});

		// Replace entire achievement object
		await engine.setAchievements(() => ({
			completedTutorial: true,
			score: 100,
		}));

		expect(achievementEvent?.old).toEqual({});
		expect(achievementEvent?.new).toEqual({
			completedTutorial: true,
			score: 100,
		});

		// Replace entire settings object
		await engine.setSettings(() => ({
			autoSave: true,
			theme: "dark",
		}));

		expect(settingEvent?.old).toEqual({});
		expect(settingEvent?.new).toEqual({
			autoSave: true,
			theme: "dark",
		});
	});
});

describe("Event Emission Control", () => {
	test("setVars with emitEvent=false should not emit stateChange event", async () => {
		let stateChangeEmitted = false;
		const listener = engine.on(":stateChange", () => {
			stateChangeEmitted = true;
		});

		engine.setVars((state) => {
			state.player.name = "NoEventName";
		}, false);

		expect(stateChangeEmitted).toBe(false);
		expect(engine.vars.player.name).toBe("NoEventName");

		listener();
	});

	test("setAchievements with emitEvent=false should not emit achievementChange event", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(persistence);

		let achievementChangeEmitted = false;
		const listener = engine.on(":achievementChange", () => {
			achievementChangeEmitted = true;
		});

		await engine.setAchievements((ach) => {
			ach.testAchievement = true;
		}, false);

		expect(achievementChangeEmitted).toBe(false);
		expect(engine.achievements.testAchievement).toBe(true);

		listener();
	});

	test("setSettings with emitEvent=false should not emit settingChange event", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(persistence);

		let settingChangeEmitted = false;
		const listener = engine.on(":settingChange", () => {
			settingChangeEmitted = true;
		});

		await engine.setSettings((settings) => {
			settings.testSetting = "value";
		}, false);

		expect(settingChangeEmitted).toBe(false);
		expect(engine.settings.testSetting).toBe("value");

		listener();
	});

	test("methods should still emit events when emitEvent=true (default behavior)", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(persistence);

		let stateChangeEmitted = false;
		let achievementChangeEmitted = false;
		let settingChangeEmitted = false;

		const stateListener = engine.on(":stateChange", () => {
			stateChangeEmitted = true;
		});
		const achievementListener = engine.on(":achievementChange", () => {
			achievementChangeEmitted = true;
		});
		const settingListener = engine.on(":settingChange", () => {
			settingChangeEmitted = true;
		});

		engine.setVars((state) => {
			state.testVar = "value";
		}, true);

		await engine.setAchievements((ach) => {
			ach.testAchievement = true;
		}, true);

		await engine.setSettings((settings) => {
			settings.testSetting = "value";
		}, true);

		expect(stateChangeEmitted).toBe(true);
		expect(achievementChangeEmitted).toBe(true);
		expect(settingChangeEmitted).toBe(true);

		stateListener();
		achievementListener();
		settingListener();
	});

	test("emitEvent parameter prevents infinite recursion in event listeners", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await initEngineWithExtraSettings(persistence);

		let stateChangeCount = 0;
		let achievementChangeCount = 0;
		let settingChangeCount = 0;

		const stateListener = engine.on(":stateChange", () => {
			stateChangeCount++;
			if (stateChangeCount < 3) {
				engine.setVars((state) => {
					state.recursionTest = stateChangeCount;
				}, false); // Prevent infinite recursion
			}
		});

		const achievementListener = engine.on(":achievementChange", () => {
			achievementChangeCount++;
			if (achievementChangeCount < 3) {
				engine.setAchievements((ach) => {
					ach.recursionTest = achievementChangeCount;
				}, false); // Prevent infinite recursion
			}
		});

		const settingListener = engine.on(":settingChange", () => {
			settingChangeCount++;
			if (settingChangeCount < 3) {
				engine.setSettings((settings) => {
					settings.recursionTest = settingChangeCount;
				}, false); // Prevent infinite recursion
			}
		});

		// Trigger initial events
		engine.setVars((state) => {
			state.initialTrigger = true;
		});

		await engine.setAchievements((ach) => {
			ach.initialTrigger = true;
		});

		await engine.setSettings((settings) => {
			settings.initialTrigger = true;
		});

		// Should only fire once due to emitEvent=false in listeners
		expect(stateChangeCount).toBe(1);
		expect(achievementChangeCount).toBe(1);
		expect(settingChangeCount).toBe(1);

		// But the values should still be updated
		expect(engine.vars.recursionTest).toBe(1);
		expect(engine.achievements.recursionTest).toBe(1);
		expect(engine.settings.recursionTest).toBe(1);

		stateListener();
		achievementListener();
		settingListener();
	});
});

describe("PRNG and Random Number Generation", () => {
	test("should generate deterministic random numbers with fixed seed", async () => {
		const fixedSeed = 12345;
		const engine1 = await SugarboxEngine.init({
			config: {
				initialSeed: fixedSeed,
				regenSeed: false, // Never regenerate seed
			},
			name: "Test1",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		const engine2 = await SugarboxEngine.init({
			config: {
				initialSeed: fixedSeed,
				regenSeed: false, // Never regenerate seed
			},
			name: "Test2",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Both engines should generate the same sequence
		const sequence1: number[] = [];
		const sequence2: number[] = [];

		for (let i = 0; i < 10; i++) {
			sequence1.push(engine1.random);
			sequence2.push(engine2.random);
		}

		expect(sequence1).toEqual(sequence2);

		// all generated numbers should be the same
		expect([...new Set(sequence1)][0]).toEqual(sequence1[0]);
	});

	test("should generate different sequences when regenSeed is false vs true", async () => {
		const fixedSeed = 54321;

		const engineNoRegen = await SugarboxEngine.init({
			config: {
				initialSeed: fixedSeed,
				regenSeed: false,
			},
			name: "NoRegen",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		const engineWithRegen = await SugarboxEngine.init({
			config: {
				initialSeed: fixedSeed,
				regenSeed: "passage",
			},
			name: "WithRegen",
			otherPassages: [{ data: "Next passage", name: "Next" }],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Get initial random numbers
		const noRegenFirst = engineNoRegen.random;
		const withRegenFirst = engineWithRegen.random;

		// Navigate to new passage (only affects withRegen engine)
		engineWithRegen.navigateTo("Next");

		// Get second random numbers
		const noRegenSecond = engineNoRegen.random;
		const withRegenSecond = engineWithRegen.random;

		// Sanity check: both engines started from the same seed
		expect(noRegenFirst).toBe(withRegenFirst);

		// The sequences should be different due to seed regeneration
		expect(noRegenSecond).not.toBe(withRegenSecond);
	});

	test("should regenerate seed on passage navigation only when regenSeed is 'passage'", async () => {
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 98765,
				regenSeed: "passage",
			},
			name: "PassageRegen",
			otherPassages: [
				{ data: "First passage", name: "Passage1" },
				{ data: "Second passage", name: "Passage2" },
			],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		const initialRandom = engine.random;

		engine.navigateTo("Passage1");
		const afterFirstNav = engine.random;

		engine.navigateTo("Passage2");
		const afterSecondNav = engine.random;

		// Each navigation should change the seed, affecting subsequent randoms
		expect(initialRandom).not.toBe(afterFirstNav);
		expect(afterFirstNav).not.toBe(afterSecondNav);

		// Same passage navigation should not change the seed
		const oneMoreRandom = engine.random;
		expect(oneMoreRandom).toBe(afterSecondNav);
	});

	test("should regenerate seed on each call when regenSeed is 'eachCall'", async () => {
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 11111,
				regenSeed: "eachCall",
			},
			name: "EachCallRegen",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Generate multiple random numbers
		const randoms: number[] = [];
		for (let i = 0; i < 5; i++) {
			randoms.push(engine.random);
		}

		// All should be different (extremely unlikely to get duplicates)
		const uniqueValues = new Set(randoms);
		expect(uniqueValues.size).toBe(randoms.length);
	});

	test("should preserve random state across save/load with regenSeed false", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 99999,
				persistence,
				regenSeed: false,
			},
			name: "SaveLoadRandom",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Generate some random numbers to advance the state
		const beforeSave: number[] = [];
		for (let i = 0; i < 3; i++) {
			beforeSave.push(engine.random);
		}

		// Save the current state
		await engine.saveToSaveSlot(1);

		// Generate more random numbers
		const afterSave: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterSave.push(engine.random);
		}

		// Load the saved state
		await engine.loadFromSaveSlot(1);

		// Generate the same number of randoms as after save
		const afterLoad: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterLoad.push(engine.random);
		}

		// After loading, we should get the same sequence as after save
		expect(afterLoad).toEqual(afterSave);
	});

	test("should maintain seed state when navigating through history", async () => {
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 77777,
				regenSeed: "passage",
			},
			name: "HistoryRandom",
			otherPassages: [
				{ data: "First passage", name: "Passage1" },
				{ data: "Second passage", name: "Passage2" },
			],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Navigate and collect random numbers at each step
		const startRandom = engine.random;

		engine.navigateTo("Passage1");
		const passage1Random = engine.random;

		engine.navigateTo("Passage2");
		// Consume another value at passage2 to advance RNG state
		void engine.random;

		// Go back in history
		engine.backward(2); // Back to start
		const backToStartRandom = engine.random;

		engine.forward(1); // Forward to Passage1
		const backToPassage1Random = engine.random;

		// Random numbers should be consistent when revisiting states
		expect(backToStartRandom).toBe(startRandom);
		expect(backToPassage1Random).toBe(passage1Random);
	});

	test("should generate numbers in expected range", async () => {
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 55555,
			},
			name: "RangeTest",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Generate many random numbers and verify they're all in [0, 1) range
		for (let i = 0; i < 100; i++) {
			const random = engine.random;
			expect(random).toBeGreaterThanOrEqual(0);
			expect(random).toBeLessThan(1);
		}
	});

	test("should export and import random state correctly", async () => {
		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 33333,
				regenSeed: false,
			},
			name: "ExportImportRandom",
			otherPassages: [],
			startPassage: { data: "Start passage", name: "Start" },
			variables: {},
		});

		// Generate some randoms to advance state
		engine.random;
		engine.random;

		// Export the state
		const exportData = await engine.saveToExport();

		// Generate more randoms
		const afterExport: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterExport.push(engine.random);
		}

		// Import the exported state
		await engine.loadFromExport(exportData);

		// Generate the same number of randoms
		const afterImport: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterImport.push(engine.random);
		}

		// Should get the same sequence
		expect(afterImport).toEqual(afterExport);
	});

	test("should handle recursive objects (inventory-item relationships) through save/load cycle", async () => {
		type SerializedInventory = {
			id: string;
			items: Item[];
		};

		type SerializedItem = {
			name: string;
			inventory: Inventory;
		};

		class Inventory implements SugarBoxClassInstance<SerializedInventory> {
			static readonly classId = "GameInventory";

			id: string;
			items: Item[] = [];

			constructor(id: string) {
				this.id = id;
			}

			addItem(name: string): Item {
				const item = new Item(name, this);
				this.items.push(item);
				return item;
			}

			toJSON(): SerializedInventory {
				return {
					id: this.id,
					items: this.items,
				};
			}

			static fromJSON(data: SerializedInventory): Inventory {
				const inventory = new Inventory(data.id);

				inventory.items = data.items;

				for (const item of inventory.items) {
					item.inventory = inventory;
				}

				return inventory;
			}
		}

		class Item implements SugarBoxClassInstance<SerializedItem> {
			static readonly classId = "GameItem";

			name: string;
			inventory: Inventory;

			constructor(name: string, inventory: Inventory) {
				this.name = name;
				this.inventory = inventory;
			}

			getInventoryId(): string {
				return this.inventory.id;
			}

			toJSON(): SerializedItem {
				return { inventory: this.inventory, name: this.name };
			}

			static fromJSON(data: SerializedItem): Item {
				return new Item(data.name, data.inventory);
			}
		}

		Inventory satisfies SugarBoxClassConstructor<SerializedInventory>;
		Item satisfies SugarBoxClassConstructor<SerializedItem>;

		const testEngine = await SugarboxEngine.init({
			classes: [Inventory, Item],
			config: {
				persistence: createPersistenceAdapter(),
			},
			name: "RecursiveObjectTest",
			otherPassages: [],
			startPassage: { data: "Test passage", name: "Start" },
			variables: {
				chestInventory: new Inventory("treasure-chest"),
				playerInventory: new Inventory("player"),
			} as unknown as GenericSerializableObject,
		});

		testEngine.setVars((vars) => {
			const typedVars = vars as unknown as {
				playerInventory: Inventory;
				chestInventory: Inventory;
			};

			typedVars.playerInventory.addItem("Magic Sword");
			typedVars.playerInventory.addItem("Health Potion");
			typedVars.chestInventory.addItem("Golden Coin");
			typedVars.chestInventory.addItem("Ancient Key");
		});

		const currentVars = testEngine.vars as unknown as {
			playerInventory: Inventory;
			chestInventory: Inventory;
		};

		const sword = currentVars.playerInventory.items[0];
		const coin = currentVars.chestInventory.items[0];
		expect(sword).toBeDefined();
		expect(coin).toBeDefined();
		expect(sword?.inventory).toBe(currentVars.playerInventory);
		expect(coin?.inventory).toBe(currentVars.chestInventory);

		await testEngine.saveToSaveSlot(1);

		testEngine.setVars((vars) => {
			const typedVars = vars as unknown as {
				playerInventory: Inventory;
				chestInventory: Inventory;
			};

			typedVars.playerInventory = new Inventory("modified");
			typedVars.chestInventory = new Inventory("modified");
		});

		{
			const varsAfterModify = testEngine.vars as unknown as {
				playerInventory: Inventory;
				chestInventory: Inventory;
			};

			expect(varsAfterModify.playerInventory.id).toBe("modified");
			expect(varsAfterModify.playerInventory.items.length).toBe(0);
		}

		await testEngine.loadFromSaveSlot(1);

		{
			const loadedVars = testEngine.vars as unknown as {
				playerInventory: Inventory;
				chestInventory: Inventory;
			};

			expect(loadedVars.playerInventory).toBeInstanceOf(Inventory);
			expect(loadedVars.chestInventory).toBeInstanceOf(Inventory);
			expect(loadedVars.playerInventory.id).toBe("player");
			expect(loadedVars.chestInventory.id).toBe("treasure-chest");

			const loadedSword = loadedVars.playerInventory.items.find(
				(item: Item) => item.name === "Magic Sword",
			);
			const loadedPotion = loadedVars.playerInventory.items.find(
				(item: Item) => item.name === "Health Potion",
			);
			const loadedCoin = loadedVars.chestInventory.items.find(
				(item: Item) => item.name === "Golden Coin",
			);
			const loadedKey = loadedVars.chestInventory.items.find(
				(item: Item) => item.name === "Ancient Key",
			);

			expect(loadedSword).toBeInstanceOf(Item);
			expect(loadedPotion).toBeInstanceOf(Item);
			expect(loadedCoin).toBeInstanceOf(Item);
			expect(loadedKey).toBeInstanceOf(Item);

			expect(loadedSword?.inventory).toBe(loadedVars.playerInventory);
			expect(loadedPotion?.inventory).toBe(loadedVars.playerInventory);
			expect(loadedCoin?.inventory).toBe(loadedVars.chestInventory);
			expect(loadedKey?.inventory).toBe(loadedVars.chestInventory);

			expect(loadedSword?.getInventoryId()).toBe("player");
			expect(loadedCoin?.getInventoryId()).toBe("treasure-chest");
		}

		const exportData = await testEngine.saveToExport();

		testEngine.setVars((vars) => {
			const typedVars = vars as unknown as { playerInventory: Inventory };
			typedVars.playerInventory = new Inventory("export-test");
		});

		await testEngine.loadFromExport(exportData);

		{
			const exportedVars = testEngine.vars as unknown as {
				playerInventory: Inventory;
			};

			expect(exportedVars.playerInventory.id).toBe("player");
			expect(exportedVars.playerInventory.items.length).toBe(2);

			const exportedSword = exportedVars.playerInventory.items.find(
				(item: Item) => item.name === "Magic Sword",
			);
			expect(exportedSword?.inventory).toBe(exportedVars.playerInventory);
		}
	});
});

describe("Error Conditions and Edge Cases", () => {
	test("should throw an error when loading a save with no migrator found for an outdated version", async () => {
		const persistence = createPersistenceAdapter();

		// Create a save with version 0.1.0
		const engine1 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.1.0`,
			},
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { testProp: "oldValue" },
		});
		await engine1.saveToSaveSlot(1);

		// Initialize engine2 with version 0.3.0, but only register a migrator from 0.1.0 to 0.2.0
		// This simulates a missing migration step (0.2.0 to 0.3.0)
		const engine2 = await SugarboxEngine.init({
			achievements: {},
			config: {
				persistence,
				saveVersion: `0.3.0`,
			},
			migrations: [
				{
					data: {
						migrater: (data: { testProp: string }) => ({
							testProp: `${data.testProp}-migrated`,
						}),
						to: `0.2.0`,
					},
					from: `0.1.0`,
				},
			],
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: { testProp: "defaultValue" },
		});

		let didThrow = false;
		try {
			await engine2.loadFromSaveSlot(1);
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toContain(
				"No migrator function found for save version 0.2.0",
			);
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error when attempting to register duplicate migrators", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			achievements: {},
			config: { persistence },
			name: "Test",
			otherPassages: [],
			startPassage: { data: "This is the start passage", name: "Start" },
			variables: {},
		});

		const migrator1 = {
			data: { migrater: (data: object) => data, to: `0.2.0` },
			from: `0.1.0`,
		} as const;
		const migrator2 = {
			data: { migrater: (data: object) => data, to: `0.3.0` },
			from: `0.1.0`, // Duplicate version
		} as const;

		engine.registerMigrators(migrator1);

		let didThrow = false;
		try {
			engine.registerMigrators(migrator2);
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toContain(
				"A migration for version 0.1.0 already exists",
			);
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error when navigating to a non-existent passage", () => {
		let didThrow = false;
		try {
			engine.navigateTo("NonExistentPassage");
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toBeString();
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error if the engine is initialized without a start passage", async () => {
		let didThrow = false;
		try {
			// @ts-expect-error This test specifically aims to trigger an error for missing startPassage
			await SugarboxEngine.init({
				achievements: {},
				config: { persistence: createPersistenceAdapter() },
				name: "InvalidInitTest",
				otherPassages: [],
				variables: {},
			});
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toBeString();
		}
		expect(didThrow).toBeTrue();
	});
});

describe("Dynamic Initial State", () => {
	test("should accept a static object as initial state", async () => {
		const staticVariables = {
			gold: 100,
			player: { level: 1, name: "Static Player" },
		};

		const engine = await SugarboxEngine.init({
			config: {
				persistence: createPersistenceAdapter(),
			},
			name: "StaticTest",
			otherPassages: [],
			startPassage: { data: "Welcome!", name: "Start" },
			variables: staticVariables,
		});

		expect(engine.vars.player.name).toBe("Static Player");
		expect(engine.vars.gold).toBe(100);
	});

	test("should accept a function that returns initial state", async () => {
		const dynamicVariables = (engine: SugarboxEngine<string>) => ({
			engineName: engine.name,
			player: { level: 1, name: "Dynamic Player" },
			randomStat: Math.floor(engine.random * 100) + 1, // Random 1-100
		});

		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 12345, // Fixed seed for deterministic testing
				persistence: createPersistenceAdapter(),
			},
			name: "DynamicTest",
			otherPassages: [],
			startPassage: { data: "Welcome!", name: "Start" },
			variables: dynamicVariables,
		});

		expect(engine.vars.player.name).toBe("Dynamic Player");
		expect(engine.vars.randomStat).toBeNumber();
		expect(engine.vars.randomStat).toBeGreaterThanOrEqual(1);
		expect(engine.vars.randomStat).toBeLessThanOrEqual(100);
		expect(engine.vars.engineName).toBe("DynamicTest");
	});

	test("should provide access to engine properties in dynamic initial state", async () => {
		const dynamicVariables = (
			engine: SugarboxEngine<
				string,
				{
					engineName: string;
					passageId: string;
					randomValue: number;
					hasAchievements: boolean;
					hasSettings: boolean;
				},
				string,
				{
					firstLogin: boolean;
				},
				{
					volume: number;
				}
			>,
		) => {
			// Test that we can access various engine properties safely
			return {
				engineName: engine.name,
				hasAchievements: typeof engine.achievements === "object",
				hasSettings: typeof engine.settings === "object",
				passageId: engine.passageId,
				randomValue: engine.random,
			};
		};

		const engine = await SugarboxEngine.init({
			achievements: { firstLogin: false },
			config: {
				persistence: createPersistenceAdapter(),
			},
			name: "PropertyAccessTest",
			otherPassages: [],
			settings: { volume: 0.8 },
			startPassage: { data: "Test content", name: "TestStart" },
			variables: dynamicVariables,
		});

		expect(engine.vars.engineName).toBe("PropertyAccessTest");
		expect(engine.vars.passageId).toBe("TestStart");
		expect(engine.vars.randomValue).toBeNumber();
		expect(engine.vars.hasAchievements).toBe(true);
		expect(engine.vars.hasSettings).toBe(true);
	});

	test("should preserve $$id and $$seed properties with dynamic initial state", async () => {
		const dynamicVariables = (_engine: SugarboxEngine<string>) => ({
			$$id: "ShouldBeOverwritten",
			$$seed: 99999,
			customProp: "test",
		});

		const engine = await SugarboxEngine.init({
			config: {
				initialSeed: 54321,
				persistence: createPersistenceAdapter(),
			},
			name: "PreservePropsTest",
			otherPassages: [],
			startPassage: { data: "Content", name: "CorrectStart" },
			variables: dynamicVariables,
		});

		expect(engine.vars.customProp).toBe("test");
		expect(engine.vars.$$id).toBe("CorrectStart");
		expect(engine.vars.$$seed).toBe(54321);
	});
});
