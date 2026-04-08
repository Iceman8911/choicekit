import { describe, expect, expectTypeOf, it } from "bun:test";
import { createLruCacheAdapter } from "../adapters/cache/lru";
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

		engine.addPassages({
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

	// ==================== Configuration & Compaction ====================

	it("should compact state snapshots while preserving state and history over 500 navigations", async () => {
		const maxStates = 16;

		const engine = await new ChoicekitEngineBuilder()
			.withName("Compaction500History")
			.withVars({ counter: 0 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
			)
			.withConfig({
				loadOnStart: false,
				maxStates,
				stateMergeCount: 3,
			})
			.build();

		for (let i = 1; i <= 500; i++) {
			engine.setVars((state) => {
				state.counter = i;
			});

			engine.navigateTo(i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a");
		}

		expect(engine.vars.counter).toBe(500);
		expect(engine.passageId).toBe("b");

		const indexBeforeBack = engine.index;
		engine.backward(5);
		expect(engine.index).toBeLessThan(indexBeforeBack);
		expect(engine.vars.counter).toBeLessThan(500);

		engine.forward(5);
		expect(engine.index).toBe(indexBeforeBack);
		expect(engine.vars.counter).toBe(500);

		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData | null = null;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = await save.getData();
				break;
			}
		}

		expect(saveData).not.toBeNull();
		expect(saveData?.storyIndex).toBe(engine.index);
		expect(saveData?.snapshots.length).toBeLessThanOrEqual(maxStates);
	});

	it("should preserve withSave plugin state while compacting snapshots", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("CompactionTimeline")
			.withVars({ marker: 0 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({
				loadOnStart: false,
				maxStates: 12,
				stateMergeCount: 2,
			})
			.withPlugin(timelinePlugin, undefined)
			.build();

		for (let i = 1; i <= 160; i++) {
			await engine.$.timeline.setValue(i);
			engine.setVars((state) => {
				state.marker = i;
			});
			engine.navigateTo(i % 2 === 0 ? "b" : "a");
		}

		expect(engine.$.timeline.getValue()).toBe(160);
		expect(engine.vars.marker).toBe(160);

		engine.backward(10);
		const rewoundPluginValue = engine.$.timeline.getValue();
		expect(rewoundPluginValue).toBeLessThan(160);

		engine.forward(10);
		expect(engine.$.timeline.getValue()).toBe(160);
		expect(engine.vars.marker).toBe(160);
	});

	it("should support a 500-navigation compaction with consistent speed", async () => {
		const maxStates = 32;
		const engine = await new ChoicekitEngineBuilder()
			.withName("Compaction500")
			.withVars({
				player: {
					flags: {
						hasKey: false,
						isArmed: false,
					},
					inventory: {
						gold: 0,
						items: [] as string[],
					},
					stats: {
						health: 100,
						stamina: 50,
					},
				},
				points: 0,
				recentEvents: [] as Array<{ passage: string; step: number }>,
				world: {
					chapter: 1,
					lastPassage: "a",
					visited: 0,
				},
			})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
			)
			.withConfig({
				loadOnStart: false,
				maxStates,
				stateMergeCount: 4,
			})
			.build();

		const firstChunkStartedAt = performance.now();

		for (let i = 1; i <= 250; i++) {
			engine.setVars((state) => {
				state.points = i;
				state.player.flags.isArmed = i % 2 === 0;
				state.player.flags.hasKey = i % 5 === 0;
				state.player.inventory.gold += i % 7;
				state.player.inventory.items.push(`item-${i % 4}`);
				if (state.player.inventory.items.length > 8) {
					state.player.inventory.items.shift();
				}
				state.player.stats.health = Math.max(0, 100 - (i % 13));
				state.player.stats.stamina = (state.player.stats.stamina + 3) % 100;
				state.recentEvents.push({
					passage: i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a",
					step: i,
				});
				if (state.recentEvents.length > 12) {
					state.recentEvents.shift();
				}
				state.world.chapter = 1 + Math.floor(i / 2500);
				state.world.lastPassage = i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a";
				state.world.visited++;
			});

			engine.navigateTo(i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a");
		}

		const firstChunkElapsed = performance.now() - firstChunkStartedAt;

		const secondChunkStartedAt = performance.now();

		for (let i = 251; i <= 500; i++) {
			engine.setVars((state) => {
				state.points = i;
				state.player.flags.isArmed = i % 2 === 0;
				state.player.flags.hasKey = i % 5 === 0;
				state.player.inventory.gold += i % 7;
				state.player.inventory.items.push(`item-${i % 4}`);
				if (state.player.inventory.items.length > 8) {
					state.player.inventory.items.shift();
				}
				state.player.stats.health = Math.max(0, 100 - (i % 13));
				state.player.stats.stamina = (state.player.stats.stamina + 3) % 100;
				state.recentEvents.push({
					passage: i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a",
					step: i,
				});
				if (state.recentEvents.length > 12) {
					state.recentEvents.shift();
				}
				state.world.chapter = 1 + Math.floor(i / 2500);
				state.world.lastPassage = i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a";
				state.world.visited++;
			});

			engine.navigateTo(i % 3 === 0 ? "c" : i % 2 === 0 ? "b" : "a");
		}

		const secondChunkElapsed = performance.now() - secondChunkStartedAt;

		expect(engine.vars.points).toBe(500);
		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData | null = null;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = await save.getData();
				break;
			}
		}

		expect(saveData?.snapshots.length).toBeLessThanOrEqual(maxStates);
		expect(secondChunkElapsed / firstChunkElapsed).toBeLessThan(2.5);
	});

	it("should keep complex vars and withSave plugin state responsive across 500 navigations", async () => {
		type VisitRecord = {
			branch: string;
			focus: string[];
			passage: string;
			turn: number;
		};

		type TravelLogPluginGenerics = ValidatePluginGenerics<{
			id: "travelLog";
			api: {
				appendVisit: (visit: VisitRecord) => Promise<void>;
				getSummary: () => {
					byBranch: Record<string, number>;
					byPassage: Record<string, number>;
					lastVisit: VisitRecord | null;
					total: number;
				};
				getVisits: () => VisitRecord[];
			};
			serializedState: {
				lastVisit: VisitRecord | null;
				summary: {
					byBranch: Record<string, number>;
					byPassage: Record<string, number>;
					lastVisit: VisitRecord | null;
					total: number;
				};
				visits: VisitRecord[];
			};
			state: {
				lastVisit: VisitRecord | null;
				summary: {
					byBranch: Record<string, number>;
					byPassage: Record<string, number>;
					lastVisit: VisitRecord | null;
					total: number;
				};
				visits: VisitRecord[];
			};
		}>;

		type ArtifactRecord = {
			id: string;
			metadata: {
				importance: number;
				labels: string[];
			};
			passage: string;
		};

		type ArtifactVaultPluginGenerics = ValidatePluginGenerics<{
			id: "artifactVault";
			api: {
				captureArtifact: (artifact: ArtifactRecord) => Promise<void>;
				getArtifacts: () => ArtifactRecord[];
				getSummary: () => {
					lastPassage: string;
					recentIds: string[];
					total: number;
					byPassage: Record<string, number>;
				};
			};
			serializedState: {
				artifacts: ArtifactRecord[];
				summary: {
					lastPassage: string;
					recentIds: string[];
					total: number;
					byPassage: Record<string, number>;
				};
			};
			state: {
				artifacts: ArtifactRecord[];
				summary: {
					lastPassage: string;
					recentIds: string[];
					total: number;
					byPassage: Record<string, number>;
				};
			};
		}>;

		type HeavyVars = {
			player: {
				flags: {
					hasCompass: boolean;
					isAlert: boolean;
					knowsRoute: boolean;
				};
				inventory: {
					keys: string[];
					notes: string[];
					supplies: string[];
				};
				stats: {
					focus: number;
					hp: number;
					stamina: number;
				};
			};
			session: {
				breadcrumbs: Array<{ passage: string; turn: number }>;
				lastDecision: {
					branch: string;
					passage: string;
				};
				turn: number;
			};
			world: {
				chapter: number;
				contacts: string[];
				danger: number;
				lastPassage: string;
				weather: string;
			};
		};

		const travelLogPlugin = definePlugin<TravelLogPluginGenerics>({
			id: "travelLog",
			initApi: ({ state, triggerSave }) => ({
				appendVisit: async (visit) => {
					state.visits.push(visit);
					state.summary.total++;
					state.summary.byBranch[visit.branch] =
						(state.summary.byBranch[visit.branch] ?? 0) + 1;
					state.summary.byPassage[visit.passage] =
						(state.summary.byPassage[visit.passage] ?? 0) + 1;
					state.summary.lastVisit = { ...visit, focus: [...visit.focus] };
					state.lastVisit = state.summary.lastVisit;

					if (state.visits.length > 48) {
						state.visits.shift();
					}

					await triggerSave();
				},
				getSummary: () => ({
					byBranch: { ...state.summary.byBranch },
					byPassage: { ...state.summary.byPassage },
					lastVisit: state.summary.lastVisit
						? {
								...state.summary.lastVisit,
								focus: [...state.summary.lastVisit.focus],
							}
						: null,
					total: state.summary.total,
				}),
				getVisits: () =>
					state.visits.map((visit) => ({
						...visit,
						focus: [...visit.focus],
					})),
			}),
			initState: () => ({
				lastVisit: null,
				summary: {
					byBranch: { alpha: 0, beta: 0, delta: 0, gamma: 0 },
					byPassage: { a: 0, b: 0, c: 0, d: 0 },
					lastVisit: null,
					total: 0,
				},
				visits: [],
			}),
			onDeserialize: ({ data, state }) => {
				state.lastVisit = data.lastVisit
					? {
							...data.lastVisit,
							focus: [...data.lastVisit.focus],
						}
					: null;
				state.summary = {
					byBranch: { ...data.summary.byBranch },
					byPassage: { ...data.summary.byPassage },
					lastVisit: data.summary.lastVisit
						? {
								...data.summary.lastVisit,
								focus: [...data.summary.lastVisit.focus],
							}
						: null,
					total: data.summary.total,
				};
				state.visits = data.visits.map((visit) => ({
					...visit,
					focus: [...visit.focus],
				}));
			},
			serialize: {
				method: ({ lastVisit, summary, visits }) => ({
					lastVisit: lastVisit
						? {
								...lastVisit,
								focus: [...lastVisit.focus],
							}
						: null,
					summary: {
						byBranch: { ...summary.byBranch },
						byPassage: { ...summary.byPassage },
						lastVisit: summary.lastVisit
							? {
									...summary.lastVisit,
									focus: [...summary.lastVisit.focus],
								}
							: null,
						total: summary.total,
					},
					visits: visits.map((visit) => ({
						...visit,
						focus: [...visit.focus],
					})),
				}),
				withSave: true,
			},
		});

		const artifactVaultPlugin = definePlugin<ArtifactVaultPluginGenerics>({
			id: "artifactVault",
			initApi: ({ state, triggerSave }) => ({
				captureArtifact: async (artifact) => {
					state.artifacts.push(artifact);
					state.summary.total++;
					state.summary.lastPassage = artifact.passage;
					state.summary.byPassage[artifact.passage] =
						(state.summary.byPassage[artifact.passage] ?? 0) + 1;
					state.summary.recentIds.push(artifact.id);
					if (state.summary.recentIds.length > 16) {
						state.summary.recentIds.shift();
					}

					if (state.artifacts.length > 64) {
						state.artifacts.shift();
					}

					await triggerSave();
				},
				getArtifacts: () =>
					state.artifacts.map((artifact) => ({
						...artifact,
						metadata: {
							...artifact.metadata,
							labels: [...artifact.metadata.labels],
						},
					})),
				getSummary: () => ({
					byPassage: { ...state.summary.byPassage },
					lastPassage: state.summary.lastPassage,
					recentIds: [...state.summary.recentIds],
					total: state.summary.total,
				}),
			}),
			initState: () => ({
				artifacts: [],
				summary: {
					byPassage: { a: 0, b: 0, c: 0, d: 0 },
					lastPassage: "",
					recentIds: [],
					total: 0,
				},
			}),
			onDeserialize: ({ data, state }) => {
				state.artifacts = data.artifacts.map((artifact) => ({
					...artifact,
					metadata: {
						...artifact.metadata,
						labels: [...artifact.metadata.labels],
					},
				}));
				state.summary = {
					byPassage: { ...data.summary.byPassage },
					lastPassage: data.summary.lastPassage,
					recentIds: [...data.summary.recentIds],
					total: data.summary.total,
				};
			},
			serialize: {
				method: ({ artifacts, summary }) => ({
					artifacts: artifacts.map((artifact) => ({
						...artifact,
						metadata: {
							...artifact.metadata,
							labels: [...artifact.metadata.labels],
						},
					})),
					summary: {
						byPassage: { ...summary.byPassage },
						lastPassage: summary.lastPassage,
						recentIds: [...summary.recentIds],
						total: summary.total,
					},
				}),
				withSave: true,
			},
		});

		const routes = ["a", "b", "c", "d"] as const;
		const branches = ["alpha", "beta", "gamma", "delta"] as const;
		const maxStates = 500;
		const backingStore = new Map<
			number,
			HeavyVars & {
				$$id: string;
				$$plugins: Map<string, ChoicekitType.PluginSaveStructure>;
				$$seed: number;
			}
		>();

		let clearCalls = 0;
		let deleteCalls = 0;
		let getCalls = 0;
		let setCalls = 0;

		const cache: ChoicekitType.CacheAdapter<HeavyVars> = {
			clear() {
				clearCalls++;
				backingStore.clear();
			},
			delete(key) {
				deleteCalls++;
				backingStore.delete(key);
			},
			get(key) {
				getCalls++;
				return backingStore.get(key) as
					| ({
							player: {
								flags: {
									hasCompass: boolean;
									isAlert: boolean;
									knowsRoute: boolean;
								};
								inventory: {
									keys: string[];
									notes: string[];
									supplies: string[];
								};
								stats: {
									focus: number;
									hp: number;
									stamina: number;
								};
							};
							session: {
								breadcrumbs: Array<{ passage: string; turn: number }>;
								lastDecision: {
									branch: string;
									passage: string;
								};
								turn: number;
							};
							world: {
								chapter: number;
								contacts: string[];
								danger: number;
								lastPassage: string;
								weather: string;
							};
					  } & ChoicekitType.SnapshotMetadata)
					| undefined;
			},
			set(key, data) {
				setCalls++;
				backingStore.set(key, data);
			},
		};

		const engine = await new ChoicekitEngineBuilder()
			.withName("HeavyStateCacheInvalidation")
			.withVars({
				player: {
					flags: {
						hasCompass: false,
						isAlert: false,
						knowsRoute: false,
					},
					inventory: {
						keys: [],
						notes: [],
						supplies: ["rope", "lamp"],
					},
					stats: {
						focus: 12,
						hp: 20,
						stamina: 8,
					},
				},
				session: {
					breadcrumbs: [],
					lastDecision: {
						branch: "alpha",
						passage: "a",
					},
					turn: 0,
				},
				world: {
					chapter: 1,
					contacts: [],
					danger: 0,
					lastPassage: "a",
					weather: "clear",
				},
			} as HeavyVars)
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
				{ data: "C", name: "c", tags: [] },
				{ data: "D", name: "d", tags: [] },
			)
			.withConfig({
				cache,
				loadOnStart: false,
				maxStates,
				stateMergeCount: 8,
			})
			.withPlugin(travelLogPlugin, undefined)
			.withPlugin(artifactVaultPlugin, undefined)
			.build();

		for (let i = 1; i <= 500; i++) {
			const passageIndex = (i - 1) % routes.length;
			const branchIndex = (i - 1) % branches.length;
			const passage = routes[passageIndex];
			const branch = branches[branchIndex];

			if (!passage || !branch) {
				throw new Error("Unable to resolve passage or branch for stress test");
			}

			engine.setVars((state) => {
				state.player.flags.hasCompass = i % 4 === 0;
				state.player.flags.isAlert = i % 3 === 0;
				state.player.flags.knowsRoute = i > 250;
				state.player.inventory.keys.push(`key-${i % 6}`);
				state.player.inventory.notes.push(`note-${branch}-${i % 11}`);
				state.player.inventory.supplies.push(`supply-${i % 8}`);
				state.player.stats.focus = 12 + (i % 9);
				state.player.stats.hp = Math.max(1, 20 - (i % 7));
				state.player.stats.stamina = (state.player.stats.stamina + 2) % 20;
				state.session.turn = i;
				state.session.lastDecision = {
					branch,
					passage,
				};
				state.session.breadcrumbs.push({ passage, turn: i });
				if (state.session.breadcrumbs.length > 40) {
					state.session.breadcrumbs.shift();
				}
				state.world.chapter = 1 + Math.floor(i / 125);
				state.world.contacts.push(`contact-${i % 12}`);
				if (state.world.contacts.length > 24) {
					state.world.contacts.shift();
				}
				state.world.danger = (state.world.danger + i) % 13;
				state.world.lastPassage = passage;
				state.world.weather = i % 2 === 0 ? "clear" : "foggy";
			});

			await engine.$.travelLog.appendVisit({
				branch,
				focus: [`focus-${i % 5}`, `focus-${i % 7}`],
				passage,
				turn: i,
			});

			if (i % 3 === 0) {
				await engine.$.artifactVault.captureArtifact({
					id: `artifact-${i}`,
					metadata: {
						importance: i % 10,
						labels: [`branch-${branch}`, `turn-${i % 6}`],
					},
					passage,
				});
			}

			engine.navigateTo(passage);
		}

		const coalescedReadStartedAt = performance.now();
		const coalescedVars = engine.vars;
		const coalescedReadElapsed = performance.now() - coalescedReadStartedAt;

		expect(coalescedVars.session.turn).toBe(500);
		expect(coalescedVars.session.lastDecision).toEqual({
			branch: "delta",
			passage: "d",
		});
		expect(coalescedVars.world.lastPassage).toBe("d");
		expect(coalescedVars.player.inventory.keys.length).toBeLessThanOrEqual(500);
		expect(coalescedReadElapsed).toBeLessThan(100);

		expect(engine.$.travelLog.getSummary().total).toBe(500);
		expect(engine.$.travelLog.getVisits().length).toBeLessThanOrEqual(48);
		expect(engine.$.artifactVault.getSummary().total).toBe(166);
		expect(engine.$.artifactVault.getArtifacts().length).toBeLessThanOrEqual(
			64,
		);

		const deleteCallsBeforeMutation = deleteCalls;
		const invalidateStartedAt = performance.now();

		engine.setVars((state) => {
			state.player.flags.hasCompass = true;
			state.player.flags.knowsRoute = true;
			state.player.inventory.notes.push("post-coalesce-note");
			if (state.player.inventory.notes.length > 32) {
				state.player.inventory.notes.shift();
			}
			state.session.turn += 1;
			state.session.lastDecision = {
				branch: "alpha",
				passage: "c",
			};
			state.session.breadcrumbs.push({
				passage: "c",
				turn: state.session.turn,
			});
			if (state.session.breadcrumbs.length > 40) {
				state.session.breadcrumbs.shift();
			}
			state.world.lastPassage = "c";
			state.world.weather = "stormy";
		});

		engine.navigateTo("c");

		const postMutationVars = engine.vars;
		const invalidateElapsed = performance.now() - invalidateStartedAt;

		expect(postMutationVars.session.turn).toBe(501);
		expect(postMutationVars.session.lastDecision).toEqual({
			branch: "alpha",
			passage: "c",
		});
		expect(postMutationVars.world.lastPassage).toBe("c");
		expect(postMutationVars.world.weather).toBe("stormy");
		expect(deleteCalls).toBeGreaterThan(deleteCallsBeforeMutation);
		expect(invalidateElapsed).toBeLessThan(50);

		await engine.$.travelLog.appendVisit({
			branch: "alpha",
			focus: ["post", "invalidate"],
			passage: "c",
			turn: 501,
		});
		await engine.$.artifactVault.captureArtifact({
			id: "artifact-post-invalidate",
			metadata: {
				importance: 1,
				labels: ["post", "invalidate"],
			},
			passage: "c",
		});

		expect(engine.$.travelLog.getSummary().total).toBe(501);
		expect(engine.$.artifactVault.getSummary().total).toBe(167);
		expect(getCalls).toBeGreaterThan(0);
		expect(setCalls).toBeGreaterThan(0);
		expect(clearCalls).toBeGreaterThan(0);

		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData<HeavyVars> | null = null;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = await save.getData();
				break;
			}
		}

		expect(saveData).not.toBeNull();
		expect(saveData?.snapshots.length).toBeLessThanOrEqual(maxStates);
		expect(
			saveData?.snapshots[saveData.storyIndex]?.$$plugins?.get("travelLog")
				?.data,
		).toMatchObject({
			summary: {
				total: 501,
			},
		});
		expect(
			saveData?.snapshots[saveData.storyIndex]?.$$plugins?.get("artifactVault")
				?.data,
		).toMatchObject({
			summary: {
				total: 167,
			},
		});
	});

	it("should respect emitMode when creating oldState for stateChange events", async () => {
		const accEngine = await new ChoicekitEngineBuilder()
			.withName("EmitModeAcc")
			.withVars({ nested: { value: 1 } })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({ emitMode: "acc", loadOnStart: false })
			.build();

		const beforeAcc = accEngine.vars;
		let oldStateFromAccEvent: unknown = null;

		accEngine.once("stateChange", ({ oldState }) => {
			oldStateFromAccEvent = oldState;
		});

		accEngine.setVars((state) => {
			state.nested.value = 2;
		});

		expect(oldStateFromAccEvent).not.toBeNull();
		expect(oldStateFromAccEvent).not.toBe(beforeAcc);

		const perfEngine = await new ChoicekitEngineBuilder()
			.withName("EmitModePerf")
			.withVars({ nested: { value: 1 } })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({ emitMode: "perf", loadOnStart: false })
			.build();

		const beforePerf = perfEngine.vars;
		let oldStateFromPerfEvent: unknown = null;

		perfEngine.once("stateChange", ({ oldState }) => {
			oldStateFromPerfEvent = oldState;
		});

		perfEngine.setVars((state) => {
			state.nested.value = 2;
		});

		expect(oldStateFromPerfEvent).not.toBeNull();
		expect(oldStateFromPerfEvent as unknown as typeof beforePerf).toEqual(
			beforePerf,
		);
	});

	it("should use cache adapter methods when cache config is provided", async () => {
		const backingStore = new Map<
			number,
			{
				value: number;
				$$id: string;
				$$seed: number;
				$$plugins: Map<string, ChoicekitType.PluginSaveStructure>;
			}
		>();

		let clearCalls = 0;
		let deleteCalls = 0;
		let getCalls = 0;
		let setCalls = 0;

		const cache: ChoicekitType.CacheAdapter<{ value: number }> = {
			clear() {
				clearCalls++;
				backingStore.clear();
			},
			delete(key) {
				deleteCalls++;
				backingStore.delete(key);
			},
			get(key) {
				getCalls++;
				return backingStore.get(key) as
					| ({ value: number } & ChoicekitType.SnapshotMetadata)
					| undefined;
			},
			set(key, data) {
				setCalls++;
				backingStore.set(key, data);
			},
		};

		const engine = await new ChoicekitEngineBuilder()
			.withName("CacheAdapter")
			.withVars({ value: 0 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({
				cache,
				loadOnStart: false,
				maxStates: 5,
				stateMergeCount: 2,
			})
			.build();

		void engine.vars;
		void engine.vars;

		for (let i = 1; i <= 20; i++) {
			engine.setVars((state) => {
				state.value = i;
			});
			engine.navigateTo(i % 2 === 0 ? "b" : "a");
		}

		expect(engine.vars.value).toBe(20);
		expect(getCalls).toBeGreaterThan(0);
		expect(setCalls).toBeGreaterThan(0);
		expect(deleteCalls).toBeGreaterThan(0);
		expect(clearCalls).toBeGreaterThan(0);
	});

	it("should integrate with the built-in LRU cache adapter", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("LruCacheAdapterIntegration")
			.withVars({ value: 0 })
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({
				cache: createLruCacheAdapter<{ value: number }>({ maxEntries: 2 }),
				loadOnStart: false,
			})
			.build();

		for (let i = 1; i <= 8; i++) {
			engine.setVars((state) => {
				state.value = i;
			});
			engine.navigateTo(i % 2 === 0 ? "b" : "a");
		}

		expect(engine.vars.value).toBe(8);
		expect(engine.passage?.name).toBe("b");
	});

	it("should mount plugins passed via config.plugins", async () => {
		const engine = await new ChoicekitEngineBuilder()
			.withName("ConfigPlugins")
			.withVars({ marker: 0 })
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({
				loadOnStart: false,
				plugins: [timelinePlugin],
			})
			.build();

		const timelineApi = (
			engine.$ as {
				timeline?: {
					getValue: () => number;
					setValue: (value: number) => Promise<void>;
				};
			}
		).timeline;

		expect(timelineApi).toBeDefined();
		expect(timelineApi?.getValue()).toBe(0);

		await timelineApi?.setValue(42);
		expect(timelineApi?.getValue()).toBe(42);
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
});
