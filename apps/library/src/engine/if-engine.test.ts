import { describe, expect, expectTypeOf, it } from "bun:test";
import { definePlugin, type ValidatePluginGenerics } from "../plugins/plugin";
import { ChoicekitEngineBuilder } from "./builder";
import { ChoicekitEngine } from "./if-engine";
import type { ChoicekitType } from "./types/Choicekit";

// ==================== Plugin Type Definitions ====================

type CounterPluginGenerics = ValidatePluginGenerics<{
	id: "counter";
	config: { initialValue: number };
	api: {
		increment: () => void;
		decrement: () => void;
		getValue: () => number;
	};
	state: { count: number };
}>;

type LoggerPluginGenerics = ValidatePluginGenerics<{
	id: "logger";
	config: { prefix: string };
	api: {
		log: (message: string) => void;
		getLog: () => string[];
	};
	state: { logs: string[] };
	serializedState: { logs: string[] };
}>;

type CombinedPluginGenerics = ValidatePluginGenerics<{
	id: "combined";
	config: { name: string };
	api: {
		describe: () => string;
		getValue: () => number;
	};
	dependencies: [typeof counterPlugin, typeof loggerPlugin];
}>;

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

// ==================== Plugin Instances ====================

const counterPlugin = definePlugin<CounterPluginGenerics>({
	id: "counter",
	initApi: async ({ state, config }) => ({
		decrement: () => {
			state.count--;
		},
		getValue: () => state.count + config.initialValue,
		increment: () => {
			state.count++;
		},
	}),
	initState: async () => ({ count: 0 }),
	onOverride: "err",
});

const loggerPlugin = definePlugin<LoggerPluginGenerics>({
	id: "logger",
	initApi: async ({ state, config }) => ({
		getLog: () => [...state.logs],
		log: (message: string) => {
			state.logs.push(`${config.prefix}: ${message}`);
		},
	}),
	initState: async () => ({ logs: [] }),
	onDeserialize: async ({ state, data }) => {
		state.logs = data.logs;
	},
	onOverride: "err",
	serialize: {
		method: (state) => ({ logs: state.logs }),
		withSave: false,
	},
});

const combinedPlugin = definePlugin<CombinedPluginGenerics>({
	dependencies: [
		{ config: { initialValue: 10 }, plugin: counterPlugin },
		{ config: { prefix: "[COMBINED]" }, plugin: loggerPlugin },
	],
	id: "combined",
	initApi: async ({ engine, config }) => ({
		describe: () => {
			const result = `${config.name}: count=${engine.$.counter.getValue()}`;
			engine.$.logger.log(result);
			return result;
		},
		getValue: () => engine.$.counter.getValue(),
	}),
	onOverride: "err",
});

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

// ==================== Tests ====================

describe(ChoicekitEngine.name, () => {
	// ==================== Type Assertions ====================

	it("should have strict plugin types with strong generics", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginTypes")
			.withVars({ hp: 100 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 5 })
			.build();

		// Plugin namespace should exist
		expectTypeOf(engine.$).toHaveProperty("counter");

		// Plugin API should be properly typed
		expectTypeOf(engine.$.counter.increment).toBeFunction();
		expectTypeOf(engine.$.counter.decrement).toBeFunction();
		expectTypeOf(engine.$.counter.getValue).toBeFunction();

		// Return type of getValue should be number
		expectTypeOf(engine.$.counter.getValue()).toBeNumber();

		// Engine vars should be properly typed
		expectTypeOf(engine.vars.hp).toBeNumber();
	});

	it("should properly accumulate multiple plugin types", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("MultiPlugin")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 0 })
			.withPlugin(loggerPlugin, { prefix: "[LOG]" })
			.build();

		// Both plugins should be accessible and properly typed
		expectTypeOf(engine.$).toHaveProperty("counter");
		expectTypeOf(engine.$).toHaveProperty("logger");

		expectTypeOf(engine.$.counter.getValue).toBeFunction();
		expectTypeOf(engine.$.logger.getLog).toBeFunction();

		// Return types should be correct
		expectTypeOf(engine.$.counter.getValue()).toBeNumber();
		expectTypeOf(engine.$.logger.getLog()).toExtend<string[]>();
	});

	it("should support plugin dependencies with proper typing", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("DependentPlugins")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(combinedPlugin, { name: "MyApp" })
			.build();

		// All plugins should be accessible
		expectTypeOf(engine.$).toHaveProperty("combined");
		expectTypeOf(engine.$.combined.describe).toBeFunction();
		expectTypeOf(engine.$.combined.getValue).toBeFunction();

		// Dependencies should resolve correctly
		expectTypeOf(combinedPlugin.dependencies).toExtend<
			readonly [
				{
					plugin: typeof counterPlugin;
					config:
						| { initialValue: number }
						| ((config: { name: string }) => { initialValue: number });
				},
				{
					plugin: typeof loggerPlugin;
					config:
						| { prefix: string }
						| ((config: { name: string }) => { prefix: string });
				},
			]
		>();
	});

	// ==================== Plugin Functionality ====================

	it("should execute plugin functions with correct state updates", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginExecution")
			.withVars({ engineVar: 1 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 10 })
			.build();

		expect(engine.$.counter.getValue()).toBe(10);

		engine.$.counter.increment();
		expect(engine.$.counter.getValue()).toBe(11);

		engine.$.counter.increment();
		expect(engine.$.counter.getValue()).toBe(12);

		engine.$.counter.decrement();
		expect(engine.$.counter.getValue()).toBe(11);
	});

	it("should maintain plugin state independently from engine state", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginState")
			.withVars({ engineCount: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 5 })
			.build();

		engine.setVars((v) => {
			v.engineCount = 100;
		});

		// Engine state changes shouldn't affect plugin state
		expect(engine.vars.engineCount).toBe(100);
		expect(engine.$.counter.getValue()).toBe(5);

		engine.$.counter.increment();
		expect(engine.vars.engineCount).toBe(100);
		expect(engine.$.counter.getValue()).toBe(6);
	});

	it("should handle plugin state with serialization", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginSerial")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(loggerPlugin, { prefix: "[TEST]" })
			.build();

		engine.$.logger.log("message1");
		engine.$.logger.log("message2");

		expect(engine.$.logger.getLog()).toContain("[TEST]: message1");
		expect(engine.$.logger.getLog()).toContain("[TEST]: message2");
	});

	it("should allow plugins to access engine state and passage info", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginEngineAccess")
			.withVars({ playerName: "Hero" })
			.withPassages(
				{ data: "Start", name: "start", tags: ["intro"] },
				{ data: "Fight", name: "fight", tags: ["action"] },
			)
			.withPlugin(counterPlugin, { initialValue: 0 })
			.build();

		expect(engine.$.counter.getValue()).toBe(0);
		expect(engine.vars.playerName).toBe("Hero");

		engine.navigateTo("fight");
		expect(engine.passageId).toBe("fight");
	});

	// ==================== State Management ====================

	it("should update variables with setVars", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("StateUpdate")
			.withVars({ count: 0, name: "Initial" })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		expectTypeOf(engine.vars.count).toBeNumber();
		expectTypeOf(engine.vars.name).toBeString();

		engine.setVars((vars) => {
			vars.count = 5;
			vars.name = "Updated";
		});

		expect(engine.vars.count).toBe(5);
		expect(engine.vars.name).toBe("Updated");
	});

	it("should support replacing entire state with setVars return", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("ReplaceState")
			.withVars({ x: 1, y: 2 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		engine.setVars(() => ({
			x: 100,
			y: 200,
		}));

		expect(engine.vars.x).toBe(100);
		expect(engine.vars.y).toBe(200);
	});

	it("should emit stateChange event with old and new state", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("StateChangeEvent")
			.withVars({ value: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let eventData: { oldValue: number; newValue: number } = {
			newValue: NaN,
			oldValue: NaN,
		};

		engine.on("stateChange", (event) => {
			eventData = {
				newValue: event.newState.value,
				oldValue: event.oldState.value,
			};
		});

		engine.setVars((vars) => {
			vars.value = 42;
		});

		expect(eventData).not.toBeNull();
		expect(eventData?.oldValue).toBe(0);
		expect(eventData?.newValue).toBe(42);
	});

	it("should not emit stateChange when emitEvent is false", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("NoEvent")
			.withVars({ value: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let eventFired = false;

		engine.on("stateChange", () => {
			eventFired = true;
		});

		engine.setVars((v) => {
			v.value = 1;
		}, false); // emitEvent = false

		expect(eventFired).toBe(false);
	});

	// ==================== Navigation & Passages ====================

	it("should navigate between passages and update passage properties", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("Navigation")
			.withVars({})
			.withPassages<{ data: string; name: string; tags: string[] }>(
				{ data: "Start", name: "start", tags: ["beginning"] },
				{ data: "Chapter 1", name: "ch1", tags: ["story"] },
				{ data: "End", name: "end", tags: ["finale"] },
			)
			.build();

		expect(engine.passageId).toBe("start");
		expect(engine.passage?.data).toBe("Start");

		engine.navigateTo("ch1");
		expect(engine.passageId).toBe("ch1");
		expect(engine.passage?.data).toBe("Chapter 1");

		engine.navigateTo("end");
		expect(engine.passageId).toBe("end");
	});

	it("should add passages dynamically and navigate to them", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("DynamicPassages")
			.withVars({})
			.withPassages<{ data: string; name: string; tags: string[] }>({
				data: "Start",
				name: "start",
				tags: [],
			})
			.build();

		engine.addPassage({
			data: "New Room",
			name: "new",
			tags: ["dynamic"],
		});

		engine.navigateTo("new");
		expect(engine.passageId).toBe("new");
		expect(engine.passage?.data).toBe("New Room");
	});

	it("should emit passageChange events with old and new passage", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PassageEvent")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.build();

		let changeData: { oldId: string | null; newId: string | null } = {
			newId: null,
			oldId: null,
		};

		engine.on("passageChange", (event) => {
			changeData = {
				newId: event.newPassage?.name ?? null,
				oldId: event.oldPassage?.name ?? null,
			};
		});

		engine.navigateTo("b");

		expect(changeData).not.toBeNull();
		expect(changeData?.oldId).toBe("a");
		expect(changeData?.newId).toBe("b");
	});

	it("should query passages by tags", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PassageQuery")
			.withVars({})
			.withPassages<{ data: string; name: string; tags: string[] }>(
				{ data: "A", name: "a", tags: ["combat", "danger"] },
				{ data: "B", name: "b", tags: ["combat"] },
				{ data: "C", name: "c", tags: ["safe"] },
			)
			.build();

		const combatPassages = engine.getPassages({
			tags: ["combat"],
			type: "all",
		});

		expect(combatPassages.length).toBeGreaterThan(0);
		expect(combatPassages.map((p) => p.name)).toContain("a");
		expect(combatPassages.map((p) => p.name)).toContain("b");

		const dangerPassages = engine.getPassages({
			tags: ["danger", "safe"],
			type: "any",
		});

		expect(dangerPassages.length).toBeGreaterThan(0);
	});

	// ==================== History & Undo/Redo ====================

	it("should support backward and forward navigation in history", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("History")
			.withVars({ step: 0 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
			)
			.build();

		engine.navigateTo("b");
		engine.navigateTo("c");

		const indexAtEnd = engine.index;

		engine.backward();
		expect(engine.index).toBeLessThan(indexAtEnd);
		expect(engine.passageId).toBe("b");

		engine.forward();
		expect(engine.index).toBe(indexAtEnd);
		expect(engine.passageId).toBe("c");
	});

	it("should handle multiple history steps", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("MultiStep")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
			)
			.build();

		engine.navigateTo("b");
		engine.navigateTo("c");

		const indexBefore = engine.index;
		engine.backward(2);
		expect(engine.index).toBeLessThan(indexBefore);

		const indexAfterBacktrack = engine.index;
		engine.forward(2);
		expect(engine.index).toBeGreaterThan(indexAfterBacktrack);
	});

	it("should not go beyond history boundaries", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("Boundaries")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		const initialIndex = engine.index;

		engine.backward();
		expect(engine.index).toBe(initialIndex);

		engine.forward();
		expect(engine.index).toBe(initialIndex);
	});

	it("should emit historyChange for navigation and load transitions", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("HistoryChangeEvent")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({ loadOnStart: false })
			.build();

		const seen: Array<{ oldIndex: number; newIndex: number }> = [];

		engine.on("historyChange", (event) => {
			seen.push({ newIndex: event.newIndex, oldIndex: event.oldIndex });
		});

		engine.navigateTo("b");
		engine.backward();
		engine.forward();

		await engine.saveToSaveSlot(0);
		engine.navigateTo("a");
		await engine.loadFromSaveSlot(0);

		expect(seen).toContainEqual({ newIndex: 1, oldIndex: 0 });
		expect(seen).toContainEqual({ newIndex: 0, oldIndex: 1 });
		expect(seen).toContainEqual({ newIndex: 1, oldIndex: 0 });
		expect(seen[seen.length - 1]).toEqual({ newIndex: 1, oldIndex: 2 });
	});

	it("should rewind and fast-forward withSave plugin state with history movement", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("PluginTimelineHistory")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
			)
			.withPlugin(timelinePlugin, undefined)
			.build();

		await engine.$.timeline.setValue(10);
		engine.navigateTo("b");

		await engine.$.timeline.setValue(20);
		engine.navigateTo("c");

		await engine.$.timeline.setValue(30);
		expect(engine.$.timeline.getValue()).toBe(30);

		engine.backward();
		expect(engine.passageId).toBe("b");
		expect(engine.$.timeline.getValue()).toBe(20);

		engine.backward();
		expect(engine.passageId).toBe("a");
		expect(engine.$.timeline.getValue()).toBe(10);

		engine.forward(2);
		expect(engine.passageId).toBe("c");
		expect(engine.$.timeline.getValue()).toBe(30);
	});

	// ==================== Events ====================

	it("should allow subscribing with on() and unsubscribing with off()", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("EventManagement")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let callCount = 0;
		const listener = () => {
			callCount++;
		};

		engine.on("stateChange", listener);
		engine.setVars(() => {
			// dummy
		});
		expect(callCount).toBe(1);

		engine.off("stateChange", listener);
		engine.setVars(() => {
			// dummy
		});
		expect(callCount).toBe(1); // Should not increment
	});

	it("should allow subscribing with once()", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("EventManagementOnce")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let callCount = 0;

		engine.once("stateChange", () => {
			callCount++;
		});

		engine.setVars(() => {
			// dummy
		});
		engine.setVars(() => {
			// dummy
		});

		expect(callCount).toBe(1);
	});

	it("should unsubscribe via returned function from on()", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("UnsubscribeFunc")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let callCount = 0;

		const unsubscribe = engine.on("stateChange", () => {
			callCount++;
		});

		engine.setVars(() => {
			// dummy
		});
		expect(callCount).toBe(1);

		unsubscribe();

		engine.setVars(() => {
			// dummy
		});
		expect(callCount).toBe(1);
	});

	it("should support canonical event names without legacy prefix", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("CanonicalEventNames")
			.withVars({ value: 0 })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		let callCount = 0;

		engine.on("stateChange", () => {
			callCount++;
		});

		engine.setVars((vars) => {
			vars.value = 1;
		});

		expect(callCount).toBe(1);
	});

	// ==================== Reset & Persistent State ====================

	it("should reset engine to initial state", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("Reset")
			.withVars({ counter: 0 })
			.withPassages(
				{ data: "Start", name: "start", tags: [] },
				{ data: "Next", name: "next", tags: [] },
			)
			.build();

		let resetEvent: number | null = null;

		engine.on("engineReset", (event) => {
			resetEvent = event.newSeed;
		});

		engine.setVars((v) => {
			v.counter = 100;
		});
		engine.navigateTo("next");

		expect(engine.vars.counter).toBe(100);
		expect(engine.passageId).toBe("next");

		engine.reset();

		expect(engine.vars.counter).toBe(0);
		expect(engine.passageId).toBe("start");
		expect(engine.index).toBe(0);
		expect(resetEvent).not.toBeNull();
	});

	it("should support randomness with seeded PRNG", async () => {
		const config = { initialSeed: 12345 };

		const engine1 = await new ChoicekitEngineBuilder()
			.withName("Rand1")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig(config)
			.build();

		const value1 = engine1.random;

		const engine2 = await new ChoicekitEngineBuilder()
			.withName("Rand2")
			.withVars({})
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withConfig(config)
			.build();

		const value2 = engine2.random;

		// Same seed should produce same random value
		expect(value1).toBe(value2);
		expectTypeOf(value1).toBeNumber();
	});

	it("should initialize with callback-based variables using PRNG", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("CallbackVars")
			.withVars(({ prng }) => ({
				randomNum: Math.floor(prng * 1000),
				seed: prng,
			}))
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.build();

		expect(engine.vars.randomNum).toBeGreaterThanOrEqual(0);
		expect(engine.vars.randomNum).toBeLessThan(1000);
		expectTypeOf(engine.vars.seed).toBeNumber();
	});

	// ==================== Persistence (Save/Load) ====================

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

	// ==================== Complex Scenarios ====================

	it("should handle complex nested state with plugins and passage navigation", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("Complex")
			.withVars({
				player: {
					health: 100,
					inventory: {
						gold: 0,
						items: [] as string[],
					},
				},
			})
			.withPassages(
				{ data: "Start", name: "start", tags: ["safe"] },
				{ data: "Battle", name: "battle", tags: ["danger"] },
				{ data: "Treasure", name: "treasure", tags: ["reward"] },
			)
			.withPlugin(counterPlugin, { initialValue: 0 })
			.withPlugin(loggerPlugin, { prefix: "[EVENT]" })
			.build();

		// Complex state mutations
		engine.setVars((v) => {
			v.player.inventory.items.push("sword");
			v.player.inventory.gold += 100;
			v.player.health -= 10;
		});

		expect(engine.vars.player.inventory.items).toContain("sword");
		expect(engine.vars.player.inventory.gold).toBe(100);
		expect(engine.vars.player.health).toBe(90);

		// Navigation with plugin interaction
		engine.navigateTo("battle");
		engine.$.logger.log("Entered battle");
		engine.$.counter.increment();

		expect(engine.$.logger.getLog()).toContain("[EVENT]: Entered battle");
		expect(engine.$.counter.getValue()).toBe(1);

		// History and plugin state consistency
		engine.navigateTo("treasure");
		engine.backward();

		expect(engine.passageId).toBe("battle");
	});

	it("should maintain type safety across engine lifecycle", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("TypeSafety")
			.withVars({ count: 0, name: "Test" })
			.withPassages({
				data: "test",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 5 })
			.build();

		// Variables should be correctly typed at all points
		expectTypeOf(engine.vars).toExtend<{ count: number; name: string }>();
		expectTypeOf(engine.vars.count).toBeNumber();
		expectTypeOf(engine.vars.name).toBeString();

		// After mutation, types should still be correct
		engine.setVars((v) => {
			v.count = 10;
		});

		expectTypeOf(engine.vars.count).toBeNumber();
		expect(engine.vars.count).toBe(10);

		// Plugin types should persist
		expectTypeOf(engine.$.counter.getValue()).toBeNumber();
		// counterPlugin returns count + initialValue, where count starts at 0
		expect(engine.$.counter.getValue()).toBe(5); // 0 (plugin state) + 5 (initialValue)

		// Incrementing plugin updates its internal state
		engine.$.counter.increment();
		expect(engine.$.counter.getValue()).toBe(6); // 1 + 5
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

	it("should handle passage visit tracking", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("VisitTracking")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.build();

		expect(engine.getVisitCount("a")).toBe(1);
		expect(engine.getVisitCount("b")).toBe(0);

		engine.navigateTo("b");
		engine.navigateTo("a");
		engine.navigateTo("b");

		expect(engine.getVisitCount("a")).toBeGreaterThanOrEqual(2);
		expect(engine.getVisitCount("b")).toBeGreaterThanOrEqual(1);
		expect(engine.getVisitCount()).toBe(engine.getVisitCount("b"));
		expect(engine.getVisitCount("a")).toBeGreaterThan(
			engine.getVisitCount("b"),
		);
	});

	it("should support addPassages for branching content added later", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("AddPassages")
			.withVars({ chapter: 1 })
			.withPassages<{ data: string; name: string; tags: string[] }>({
				data: "intro",
				name: "intro",
				tags: ["chapter-1"],
			})
			.build();

		engine.addPassages(
			{ data: "forest", name: "forest", tags: ["chapter-1", "route-a"] },
			{ data: "city", name: "city", tags: ["chapter-1", "route-b"] },
		);

		expect(
			engine
				.getPassages({ tags: ["route-a", "route-b"], type: "any" })
				.map((p) => p.name),
		).toEqual(["forest", "city"]);
	});

	it("should reject duplicate plugin namespaces at runtime", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("DuplicatePlugins")
			.withVars({})
			.withPassages({
				data: "main",
				name: "main",
				tags: [],
			})
			.withPlugin(counterPlugin, { initialValue: 1 })
			.build();

		await expect(
			new ChoicekitEngineBuilder()
				.withName("DuplicatePluginsTwo")
				.withVars({})
				.withPassages({
					data: "main",
					name: "main",
					tags: [],
				})
				.withPlugin(counterPlugin, { initialValue: 1 })
				.withPlugin(counterPlugin, { initialValue: 2 })
				.build(),
		).rejects.toThrow();

		expect(engine.$.counter.getValue()).toBe(1);
	});

	it("should throw when trying to navigate to a passage that does not exist", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("MissingPassage")
			.withVars({})
			.withPassages({
				data: "start",
				name: "start",
				tags: [],
			})
			.build();

		//@ts-expect-error - navigateTo should only accept valid passage names
		expect(() => engine.navigateTo("missing")).toThrow();
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

		// Before load: fresh state should have empty scene list
		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([]);

		await reader.loadFromSaveSlot(4);

		// After load: vars and passages should be restored
		expect(reader.vars.chapter).toBe(0);
		expect(reader.passageId).toBe("hallway");
		expect(reader.index).toBe(historyIndexBeforeSave);

		// Plugin state should be fully restored from snapshot
		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([
			"intro",
			"hallway",
		]);

		// Passage metadata should be intact
		const currentPassage = reader.getPassages({
			tags: ["mid"],
			type: "any",
		})[0];
		expect(currentPassage).toBeDefined();
		expect(currentPassage?.name).toBe("hallway");
		expect(currentPassage?.data).toBe("Hallway");

		// Should be able to continue navigating from loaded state
		reader.navigateTo("end");
		expect(reader.passageId).toBe("end");
		expect(reader.$.storyProgress.getCompletedScenes()).toEqual([
			"intro",
			"hallway",
		]); // plugin state preserved across navigation

		// Should be able to continue updating plugin state
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

		class StoryHero {
			static readonly classId = "StoryHeroForEngineTest";

			constructor(
				public hp: number,
				public name: string,
			) {}

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
