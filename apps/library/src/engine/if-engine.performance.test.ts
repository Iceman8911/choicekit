import { describe, expect, it } from "bun:test";
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

describe("ChoicekitEngine performance", () => {
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

		const saveResult = await engine.saveToSaveSlot(0);
		expect(saveResult.success).toBe(true);

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
		const saveResult2 = await engine.saveToSaveSlot(0);
		expect(saveResult2.success).toBe(true);

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
});
