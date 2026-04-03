import { describe, expect, expectTypeOf, it } from "bun:test";
import { deserialize } from "@packages/serializer";
import { decompressPossiblyCompressedJsonString } from "@packages/string-compression";
import type { ExpandType } from "../../_internal/models/shared";
import { SugarboxEngineBuilder } from "../../engine/builder";
import createAchievementsPlugin from "./achievements";

function createSimpleAchievements() {
	return {
		foundKey: false,
		heroArc: {
			beatDemonLord: false,
			foundSecrets: 0,
		},
	} as const;
}
const simpleAchievementsplugin = createAchievementsPlugin(
	createSimpleAchievements(),
);

type WidenedSimpleAchievements = ExpandType<
	ReturnType<typeof createSimpleAchievements>
>;

describe("Achievements Plugin", () => {
	it("should strongly type the plugin depending on the argument", () => {
		type SimpleAchievements = ReturnType<
			Awaited<ReturnType<typeof simpleAchievementsplugin.initApi>>["get"]
		>;

		expectTypeOf<SimpleAchievements>().not.toEqualTypeOf<
			ReturnType<typeof createSimpleAchievements>
		>();
		expectTypeOf<SimpleAchievements>().toExtend<WidenedSimpleAchievements>();
	});

	it("should add the simple getter and setter to the engine on mount", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-achievements")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		expect(engine.$.achievements.get()).toEqual(createSimpleAchievements());

		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(engine.$.achievements.get().foundKey).toEqual(true);
	});

	it("should not apply achievement mutations if the producer throws", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-achievements")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		expect(() =>
			engine.$.achievements.set((state) => {
				state.foundKey = true;

				throw Error("Producer failed");
			}),
		).toThrow("Producer failed");

		expect(engine.$.achievements.get().foundKey).toEqual(false);
	});

	it("should allow listeners for achievement changes to be created", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-achievements")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		const achievementsApi = engine.$.achievements;

		let changeEventCalled = false;

		achievementsApi.on("change", ({ new: newState, old: oldState }) => {
			expect(newState.foundKey).toEqual(true);
			expect(oldState.foundKey).toEqual(false);
			changeEventCalled = true;
		});

		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(changeEventCalled).toEqual(true);
	});

	it("should allow listeners for achievement changes to be removed", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-achievements")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		const achievementsApi = engine.$.achievements;

		let changeEventCalled = false;

		const unsubscribe = achievementsApi.on(
			"change",
			({ new: newState, old: oldState }) => {
				expect(newState.foundKey).toEqual(true);
				expect(oldState.foundKey).toEqual(false);
				changeEventCalled = true;
			},
		);

		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(changeEventCalled).toEqual(true);

		unsubscribe();

		engine.$.achievements.set((state) => {
			state.foundKey = false;
		});

		expect(changeEventCalled).not.toEqual(false);
	});

	it("should support deep updates to nested achievement state", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-deep-update")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		engine.$.achievements.set((state) => {
			state.heroArc.beatDemonLord = true;
			state.heroArc.foundSecrets = 42;
		});

		const result = engine.$.achievements.get();

		expect(result.heroArc.beatDemonLord).toEqual(true);
		expect(result.heroArc.foundSecrets).toEqual(42);
	});

	it("should allow multiple listeners and all should be called", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-multi-listener")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		let a = false,
			b = false;

		engine.$.achievements.on("change", () => {
			a = true;
		});
		engine.$.achievements.on("change", () => {
			b = true;
		});
		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(a).toEqual(true);
		expect(b).toEqual(true);
	});

	it("should handle rapid consecutive updates and emit correct events", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-rapid-updates")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		const events: {
			new: WidenedSimpleAchievements;
			old: WidenedSimpleAchievements;
		}[] = [];

		engine.$.achievements.on("change", (e) => {
			events.push(e);
		});
		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});
		engine.$.achievements.set((state) => {
			state.heroArc.foundSecrets = 1;
		});
		engine.$.achievements.set((state) => {
			state.heroArc.foundSecrets = 2;
		});

		expect(events.length).toEqual(3);
		expect(events[0]?.new.foundKey).toEqual(true);
		expect(events[1]?.new.heroArc.foundSecrets).toEqual(1);
		expect(events[2]?.new.heroArc.foundSecrets).toEqual(2);
	});

	it("should not allow off() to remove unrelated listeners", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-off-test")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		let calledA = false,
			calledB = false;

		const a = () => {
			calledA = true;
		};
		const b = () => {
			calledB = true;
		};

		engine.$.achievements.on("change", a);
		engine.$.achievements.on("change", b);
		engine.$.achievements.off("change", a);
		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(calledA).toEqual(false);
		expect(calledB).toEqual(true);
	});

	it("should support interactive fiction style: unlock, progress, and reset achievements", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-if-style")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		// Unlock an achievement
		engine.$.achievements.set((state) => {
			state.foundKey = true;
		});

		expect(engine.$.achievements.get().foundKey).toEqual(true);

		// Progress a counter
		engine.$.achievements.set((state) => {
			state.heroArc.foundSecrets += 1;
		});

		expect(engine.$.achievements.get().heroArc.foundSecrets).toEqual(1);

		// Reset all
		engine.$.achievements.set((state) => {
			state.foundKey = false;
			state.heroArc.beatDemonLord = false;
			state.heroArc.foundSecrets = 0;
		});

		expect(engine.$.achievements.get()).toEqual(createSimpleAchievements());
	});

	it("should properly persist data when the save is exported from the engine", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-if-style")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		engine.$.achievements.set((state) => {
			state.foundKey = true;
			state.heroArc.beatDemonLord = true;
			state.heroArc.foundSecrets = 99;
		});

		await engine.$.achievements.save();

		const exportedStr = await engine.saveToExport();

		expect(
			(
				deserialize(
					await decompressPossiblyCompressedJsonString(exportedStr),
				) as any
			)["plugins"]["achievements"]["data"]["achievements"],
		).toEqual({
			foundKey: true,
			heroArc: {
				beatDemonLord: true,
				foundSecrets: 99,
			},
		});

		const newEngine = await new SugarboxEngineBuilder()
			.withName("engine-if-style2")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		await newEngine.loadFromExport(exportedStr);

		expect(newEngine.$.achievements.get()).toStrictEqual({
			foundKey: true,
			heroArc: {
				beatDemonLord: true,
				foundSecrets: 99,
			},
		});
	});

	it("should not emit change events when the state is updated but emitEvent is set to false", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-no-event")
			.withPlugin(simpleAchievementsplugin, {
				default: createSimpleAchievements(),
			})
			.build();

		let changeEventCalled = false;

		engine.$.achievements.on("change", () => {
			changeEventCalled = true;
		});

		engine.$.achievements.set(
			(state) => {
				state.foundKey = true;
			},
			false, // emitEvent set to false
		);

		expect(changeEventCalled).toEqual(false);
		expect(engine.$.achievements.get().foundKey).toEqual(true);
	});
});
