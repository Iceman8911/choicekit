import { describe, expect, it } from "bun:test";
import { definePlugin, type ValidatePluginGenerics } from "../plugins/plugin";
import { ChoicekitEngineBuilder } from "./builder";
import type { ChoicekitType } from "./types/Choicekit";

describe("ChoicekitEngine stress", () => {
	it("should maintain correctness and responsiveness through worst-case heavy navigation with multiple withSave plugins and cache invalidation cycles", async () => {
		const MAX_TIME_BUDGET_MS = 4;

		type TimelineEntry = { id: number; passage: string; turn: number };
		type TimelinePluginState = { events: TimelineEntry[] };
		type TimelinePluginGenerics = ValidatePluginGenerics<{
			id: "timeline";
			api: {
				recordEvent: (passage: string, turn: number) => Promise<void>;
				getRecentEvents: () => TimelineEntry[];
			};
			state: TimelinePluginState;
			dependencies: [];
		}>;

		const timelinePlugin = definePlugin<TimelinePluginGenerics>({
			id: "timeline",
			initApi: ({ state, triggerSave }) => ({
				getRecentEvents: () => [...state.events],
				recordEvent: async (passage: string, turn: number) => {
					state.events.push({ id: state.events.length, passage, turn });
					if (state.events.length > 50) {
						state.events.shift();
					}

					await triggerSave();
				},
			}),
			initState: () => ({ events: [] as TimelineEntry[] }),
			onDeserialize: ({ data, state }) => {
				state.events = [...data.events];
			},
			serialize: {
				method: ({ events }) => ({ events: [...events] }),
				withSave: true,
			},
		});

		type ProgressPluginState = {
			visitedRoutes: Set<string>;
			completedBranches: Record<string, boolean>;
			questsActive: number;
		};
		type ProgressPluginGenerics = ValidatePluginGenerics<{
			id: "progress";
			api: {
				recordRoute: (route: string) => Promise<void>;
				completeBranch: (branch: string) => Promise<void>;
				updateQuests: (delta: number) => Promise<void>;
				getProgress: () => {
					routes: string[];
					branches: string[];
					quests: number;
				};
			};
			state: ProgressPluginState;
			dependencies: [];
		}>;

		const progressPlugin = definePlugin<ProgressPluginGenerics>({
			id: "progress",
			initApi: ({ state, triggerSave }) => ({
				completeBranch: async (branch: string) => {
					state.completedBranches[branch] = true;
					await triggerSave();
				},
				getProgress: () => ({
					branches: Object.keys(state.completedBranches).filter(
						(branch) => state.completedBranches[branch],
					),
					quests: state.questsActive,
					routes: Array.from(state.visitedRoutes),
				}),
				recordRoute: async (route: string) => {
					state.visitedRoutes.add(route);
					await triggerSave();
				},
				updateQuests: async (delta: number) => {
					state.questsActive = Math.max(0, state.questsActive + delta);
					await triggerSave();
				},
			}),
			initState: () => ({
				completedBranches: {},
				questsActive: 0,
				visitedRoutes: new Set<string>(),
			}),
			onDeserialize: ({ data, state }) => {
				state.visitedRoutes = new Set(data.visitedRoutes);
				state.completedBranches = { ...data.completedBranches };
				state.questsActive = data.questsActive;
			},
			serialize: {
				method: ({ visitedRoutes, completedBranches, questsActive }) => ({
					completedBranches,
					questsActive,
					visitedRoutes: Array.from(visitedRoutes),
				}),
				withSave: true,
			},
		});

		type HeavyVars = {
			player: {
				health: number;
				inventory: { items: string[]; gold: number };
				stats: { maxHealth: number; level: number };
			};
			world: {
				chapter: number;
				tension: number;
				passagePath: string[];
			};
			session: {
				turnCount: number;
				eventLog: Array<{ msg: string; turn: number }>;
			};
		};

		const engine = await new ChoicekitEngineBuilder()
			.withName("HeavyStressTest")
			.withVars({
				player: {
					health: 100,
					inventory: { gold: 0, items: [] },
					stats: { level: 1, maxHealth: 100 },
				},
				session: {
					eventLog: [],
					turnCount: 0,
				},
				world: {
					chapter: 0,
					passagePath: [],
					tension: 0,
				},
			} as HeavyVars)
			.withPassages(
				{ data: "Route A", name: "a", tags: ["route"] },
				{ data: "Route B", name: "b", tags: ["route"] },
				{ data: "Route C", name: "c", tags: ["route"] },
				{ data: "Route D", name: "d", tags: ["route"] },
			)
			.withConfig({
				loadOnStart: false,
				maxStates: 500,
			})
			.withPlugin(timelinePlugin, undefined)
			.withPlugin(progressPlugin, undefined)
			.build();

		const routes = ["a", "b", "c", "d"] as const;

		for (let i = 1; i <= 500; i++) {
			const route = routes[(i - 1) % routes.length] ?? "a";

			engine.setVars((state) => {
				state.player.health = Math.max(1, 100 - (i % 37));
				state.player.inventory.gold += i % 13;
				if (i % 5 === 0) {
					state.player.inventory.items.push(`item-${i}`);
				}
				if (state.player.inventory.items.length > 25) {
					state.player.inventory.items.shift();
				}
				state.player.stats.level = 1 + Math.floor(i / 250);
				state.world.chapter = Math.floor((i - 1) / 125);
				state.world.tension = (state.world.tension + (i % 7)) % 100;
				state.world.passagePath.push(route);
				if (state.world.passagePath.length > 40) {
					state.world.passagePath.shift();
				}
				state.session.turnCount = i;
				if (i % 11 === 0) {
					state.session.eventLog.push({
						msg: `Event at turn ${i}`,
						turn: i,
					});
				}
				if (state.session.eventLog.length > 30) {
					state.session.eventLog.shift();
				}
			});

			await engine.$.timeline.recordEvent(route, i);
			if (i % 2 === 0) {
				await engine.$.progress.recordRoute(route);
			}
			if (i % 3 === 0) {
				await engine.$.progress.completeBranch(`branch-${i % 8}`);
			}
			if (i % 4 === 0) {
				await engine.$.progress.updateQuests(1);
			}

			engine.navigateTo(route);
		}

		await engine.saveToSaveSlot(0);

		let saveData: ChoicekitType.SaveData<HeavyVars> | null = null;
		for await (const save of engine.getSaves()) {
			if (save.type === "normal" && save.slot === 0) {
				saveData = save.data;
				break;
			}
		}

		expect(saveData).not.toBeNull();
		expect(saveData?.snapshots.length).toBeLessThanOrEqual(500);
		expect(engine.vars.session.turnCount).toBe(500);

		void engine.vars;
		const coalescingStart = performance.now();
		const stateAfterHeavyNav = engine.vars;
		const coalescingElapsed = performance.now() - coalescingStart;

		expect(coalescingElapsed).toBeLessThan(MAX_TIME_BUDGET_MS);
		expect(stateAfterHeavyNav.player.health).toBeGreaterThan(0);
		expect(stateAfterHeavyNav.player.health).toBeLessThanOrEqual(100);
		expect(stateAfterHeavyNav.session.turnCount).toBe(500);
		expect(stateAfterHeavyNav.world.chapter).toBe(3);

		expect(engine.$.timeline.getRecentEvents().length).toBeGreaterThan(0);
		expect(engine.$.timeline.getRecentEvents().length).toBeLessThanOrEqual(50);

		const progress = engine.$.progress.getProgress();
		expect(progress.routes).toContain("b");
		expect(progress.routes).toContain("d");
		expect(progress.quests).toBeGreaterThanOrEqual(0);

		engine.setVars((state) => {
			state.player.health = 75;
			state.session.turnCount = 501;
		});

		expect(engine.vars.player.health).toBe(75);

		engine.navigateTo("d");

		await engine.$.timeline.recordEvent("d", 501);
		await engine.$.progress.recordRoute("d");

		const invalidationStart = performance.now();
		const stateAfterInvalidation = engine.vars;
		const invalidationElapsed = performance.now() - invalidationStart;

		expect(invalidationElapsed).toBeLessThan(MAX_TIME_BUDGET_MS);
		expect(stateAfterInvalidation.player.health).toBe(75);
		expect(stateAfterInvalidation.session.turnCount).toBe(501);
		expect(
			stateAfterInvalidation.world.passagePath[
				stateAfterInvalidation.world.passagePath.length - 1
			],
		).toBe("d");

		engine.backward(10);
		const backState = engine.vars;
		expect(backState.session.turnCount).toBeLessThan(501);

		engine.forward(5);
		const forwardState = engine.vars;
		expect(forwardState.session.turnCount).toBeGreaterThan(
			backState.session.turnCount,
		);

		expect(engine.$.timeline.getRecentEvents().length).toBeGreaterThan(0);
	});
});
