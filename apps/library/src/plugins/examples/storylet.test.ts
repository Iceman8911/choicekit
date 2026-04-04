import { describe, expect, it } from "bun:test";
import { ChoicekitEngineBuilder } from "../../engine/builder";
import type { ChoicekitEngine } from "../../engine/if-engine";
import type { ChoicekitEngineWithPluginApis } from "../plugin";
import createAchievementsPlugin from "./achievements";
import createSettingsPlugin from "./settings";
import createStoryletPlugin from "./storylet";

const passages = [
	{ data: "Start", name: "start", tags: [] },
	{ data: "Forest", name: "forest", tags: [] },
	{ data: "Village", name: "village", tags: [] },
	{ data: "Castle", name: "castle", tags: [] },
] as const;

describe("Storylet Plugin", () => {
	it("should return eligible storylets sorted by ranking", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-eligible-sorting")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "low-priority",
						passageId: "village",
						priority: 1,
					},
					{
						conditions: [() => true, () => [true, 3] as const],
						name: "high-priority",
						passageId: "forest",
						priority: 10,
					},
					{
						conditions: [() => false],
						name: "ineligible",
						passageId: "castle",
						priority: 100,
					},
				],
			})
			.build();

		const eligible = engine.$.storylet.getEligibleStorylets();

		expect(eligible.map((storylet) => storylet.name)).toEqual([
			"high-priority",
			"low-priority",
		]);
	});

	it("should return top eligible storylet or null", async () => {
		const plugin = createStoryletPlugin();

		const withEligibleEngine = await new ChoicekitEngineBuilder()
			.withName("storylet-top-eligible")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "winner",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		expect(withEligibleEngine.$.storylet.getTopEligibleStorylet()?.name).toBe(
			"winner",
		);

		const withoutEligibleEngine = await new ChoicekitEngineBuilder()
			.withName("storylet-top-none")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => false],
						name: "loser",
						passageId: "forest",
						priority: 100,
					},
				],
			})
			.build();

		expect(
			withoutEligibleEngine.$.storylet.getTopEligibleStorylet(),
		).toBeNull();
	});

	it("should prioritize fully passing storylets over partial matches", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-full-vs-partial")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true, () => false],
						name: "partial-match",
						passageId: "village",
						priority: 999,
					},
					{
						conditions: [() => true],
						name: "full-match",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		const top = engine.$.storylet.getTopEligibleStorylet();

		expect(top?.name).toBe("full-match");
	});

	it("should use condition tuple priority as a tie breaker", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-condition-priority")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => [true, 1] as const],
						name: "weaker",
						passageId: "forest",
						priority: 0,
					},
					{
						conditions: [() => [true, 5] as const],
						name: "stronger",
						passageId: "village",
						priority: 0,
					},
				],
			})
			.build();

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe("stronger");
	});

	it("should track selected and loaded counts", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-selection-load-tracking")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "forest-encounter",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		engine.$.storylet.markStoryletSelected("forest-encounter");
		expect(engine.$.storylet.getStoryletStats("forest-encounter")).toEqual({
			loaded: 0,
			selected: 1,
		});

		engine.navigateTo("forest");
		expect(engine.$.storylet.getStoryletStats("forest-encounter")).toEqual({
			loaded: 1,
			selected: 1,
		});

		const loadedStorylet = engine.$.storylet.loadTopEligibleStorylet();
		expect(loadedStorylet?.name).toBe("forest-encounter");
		expect(engine.$.storylet.getStoryletStats("forest-encounter")).toEqual({
			loaded: 2,
			selected: 2,
		});
	});

	it("should persist selected and loaded counts with story save data", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-persistence-1")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "forest-encounter",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		engine.$.storylet.markStoryletSelected("forest-encounter");
		engine.navigateTo("forest");
		await engine.saveToSaveSlot(1);

		const newEngine = await new ChoicekitEngineBuilder()
			.withName("storylet-persistence-1")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "forest-encounter",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		await newEngine.loadFromSaveSlot(1);

		expect(newEngine.$.storylet.getStoryletStats("forest-encounter")).toEqual({
			loaded: 1,
			selected: 1,
		});
	});

	it("should rank complex multi-condition storylets predictably", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-complex-ranking")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [
							(engine) => engine.passageId === "start",
							() => [true, 5] as const,
							(engine) => engine.getVisitCount("start") >= 1,
						],
						name: "high-weight-full",
						passageId: "forest",
						priority: 5,
					},
					{
						conditions: [() => true, () => [true, 9] as const, () => false],
						name: "partial-even-with-high-priority",
						passageId: "castle",
						priority: 999,
					},
					{
						conditions: [() => true, () => [true, 2] as const],
						name: "full-lower-weight",
						passageId: "village",
						priority: 100,
					},
				],
			})
			.build();

		const eligible = engine.$.storylet.getEligibleStorylets();

		expect(eligible.map((entry) => entry.name)).toEqual([
			"high-weight-full",
			"full-lower-weight",
		]);
		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe(
			"high-weight-full",
		);
	});

	it("should use lexical name ordering as final deterministic tie-breaker", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-lexical-fallback")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "zeta",
						passageId: "forest",
						priority: 0,
					},
					{
						conditions: [() => true],
						name: "alpha",
						passageId: "village",
						priority: 0,
					},
				],
			})
			.build();

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe("alpha");
	});

	it("should normalize non-finite priorities to zero", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-priority-normalization")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "finite-priority",
						passageId: "forest",
						priority: 3,
					},
					{
						conditions: [() => true],
						name: "infinite-priority",
						passageId: "village",
						priority: Number.POSITIVE_INFINITY,
					},
					{
						conditions: [() => true],
						name: "nan-priority",
						passageId: "castle",
						priority: Number.NaN,
					},
				],
			})
			.build();

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe(
			"finite-priority",
		);
	});

	it("should throw for unknown storylet names and empty condition arrays", async () => {
		const plugin = createStoryletPlugin();

		const engineWithUnknown = await new ChoicekitEngineBuilder()
			.withName("storylet-unknown")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "known",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		expect(() =>
			engineWithUnknown.$.storylet.markStoryletSelected("missing"),
		).toThrow("Unknown storylet 'missing'");

		const engineWithEmptyConditions = await new ChoicekitEngineBuilder()
			.withName("storylet-empty-conditions")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [],
						name: "invalid",
						passageId: "forest",
						priority: 0,
					},
				],
			})
			.build();

		expect(() =>
			engineWithEmptyConditions.$.storylet.getEligibleStorylets(),
		).toThrow(
			"Storylet 'invalid' has no conditions. Add at least one condition callback.",
		);
	});

	it("should attribute loaded counts to the matching pending storylet passage", async () => {
		const plugin = createStoryletPlugin();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-pending-load-matching")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(plugin, {
				storylets: [
					{
						conditions: [() => true],
						name: "forest-route",
						passageId: "forest",
						priority: 0,
					},
					{
						conditions: [() => true],
						name: "village-route",
						passageId: "village",
						priority: 0,
					},
				],
			})
			.build();

		engine.$.storylet.markStoryletSelected("forest-route");
		engine.$.storylet.markStoryletSelected("village-route");

		expect(engine.$.storylet.getStoryletStats("forest-route")).toEqual({
			loaded: 0,
			selected: 1,
		});
		expect(engine.$.storylet.getStoryletStats("village-route")).toEqual({
			loaded: 0,
			selected: 1,
		});

		engine.navigateTo("castle");
		expect(engine.$.storylet.getStoryletStats("forest-route")).toEqual({
			loaded: 0,
			selected: 1,
		});
		expect(engine.$.storylet.getStoryletStats("village-route")).toEqual({
			loaded: 0,
			selected: 1,
		});

		engine.navigateTo("village");
		expect(engine.$.storylet.getStoryletStats("village-route")).toEqual({
			loaded: 1,
			selected: 1,
		});

		engine.navigateTo("forest");
		expect(engine.$.storylet.getStoryletStats("forest-route")).toEqual({
			loaded: 1,
			selected: 1,
		});
	});

	it("should support condition callbacks that read achievements and settings APIs", async () => {
		const achievementsPlugin = createAchievementsPlugin({
			progress: {
				finishedTutorial: false,
			},
		});
		const settingsPlugin = createSettingsPlugin({
			storyletsEnabled: true,
		});

		type ProgressionAwareEngine = ChoicekitEngineWithPluginApis<
			ChoicekitEngine,
			[typeof achievementsPlugin, typeof settingsPlugin]
		>;

		const storyletPlugin = createStoryletPlugin<ProgressionAwareEngine>();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-plugin-integration")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(achievementsPlugin, {
				default: {
					progress: {
						finishedTutorial: false,
					},
				},
			})
			.withPlugin(settingsPlugin, {
				default: {
					storyletsEnabled: true,
				},
			})
			.withPlugin(storyletPlugin, {
				storylets: [
					{
						conditions: [
							(engine) => engine.$.settings.get().storyletsEnabled,
							(engine) => engine.$.achievements.get().progress.finishedTutorial,
						],
						name: "tutorial-gated",
						passageId: "forest",
						priority: 20,
					},
					{
						conditions: [() => true],
						name: "fallback",
						passageId: "village",
						priority: 1,
					},
				],
			})
			.build();

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe("fallback");

		engine.$.achievements.set((state) => {
			state.progress.finishedTutorial = true;
		});

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe(
			"tutorial-gated",
		);

		engine.$.settings.set((state) => {
			state.storyletsEnabled = false;
		});

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe("fallback");
	});

	it("should allow multiple plugin-aware conditions with weighted tuple priorities", async () => {
		const achievementsPlugin = createAchievementsPlugin({
			progress: {
				hasGuildPass: true,
				reputation: 2,
			},
		});
		const settingsPlugin = createSettingsPlugin({
			hardModeStorylets: true,
		});

		type ProgressionAwareEngine = ChoicekitEngineWithPluginApis<
			ChoicekitEngine,
			[typeof achievementsPlugin, typeof settingsPlugin]
		>;

		const storyletPlugin = createStoryletPlugin<ProgressionAwareEngine>();

		const engine = await new ChoicekitEngineBuilder()
			.withName("storylet-plugin-weighted-integration")
			.withPassages<{ data: string; name: string; tags: readonly string[] }>(
				...passages,
			)
			.withPlugin(achievementsPlugin, {
				default: {
					progress: {
						hasGuildPass: true,
						reputation: 2,
					},
				},
			})
			.withPlugin(settingsPlugin, {
				default: {
					hardModeStorylets: true,
				},
			})
			.withPlugin(storyletPlugin, {
				storylets: [
					{
						conditions: [
							(engine) =>
								[engine.$.settings.get().hardModeStorylets, 3] as const,
							(engine) =>
								[engine.$.achievements.get().progress.hasGuildPass, 4] as const,
						],
						name: "guild-contract",
						passageId: "forest",
						priority: 1,
					},
					{
						conditions: [
							(engine) =>
								[
									engine.$.achievements.get().progress.reputation >= 2,
									1,
								] as const,
							() => true,
						],
						name: "town-board",
						passageId: "village",
						priority: 5,
					},
				],
			})
			.build();

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe(
			"guild-contract",
		);

		engine.$.settings.set((state) => {
			state.hardModeStorylets = false;
		});

		expect(engine.$.storylet.getTopEligibleStorylet()?.name).toBe("town-board");
	});
});
