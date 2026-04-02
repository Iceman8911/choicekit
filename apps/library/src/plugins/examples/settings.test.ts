import { describe, expect, expectTypeOf, it } from "bun:test";
import { deserialize } from "@packages/serializer";
import { decompressPossiblyCompressedJsonString } from "@packages/string-compression";
import type { ExpandType } from "../../_internal/models/shared";
import { SugarboxEngineBuilder } from "../../engine/builder";
import createSettingsPlugin from "./settings";

function createSimpleSettings() {
	return {
		musicEnabled: true,
		notifications: {
			show: true,
			type: "all",
		},
		volume: 0.5,
	} as const;
}
const simpleSettingsPlugin = createSettingsPlugin(createSimpleSettings());

type WidenedSimpleSettings = ExpandType<
	ReturnType<typeof createSimpleSettings>
>;

describe("Settings Plugin", () => {
	it("should strongly type the plugin depending on the argument", () => {
		type SimpleSettings = ReturnType<
			Awaited<ReturnType<typeof simpleSettingsPlugin.initApi>>["get"]
		>;

		expectTypeOf<SimpleSettings>().not.toEqualTypeOf<
			ReturnType<typeof createSimpleSettings>
		>();
		expectTypeOf<SimpleSettings>().toExtend<WidenedSimpleSettings>();
	});

	it("should add the simple getter and setter to the engine on mount", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-settings")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		expect(engine.$.settings.get()).toEqual(createSimpleSettings());

		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(engine.$.settings.get().musicEnabled).toEqual(false);
	});

	it("should not apply settings mutations if the producer throws", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-settings")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		expect(() =>
			engine.$.settings.set((state) => {
				state.musicEnabled = false;

				throw Error("Producer failed");
			}),
		).toThrow("Producer failed");

		expect(engine.$.settings.get().musicEnabled).toEqual(true);
	});

	it("should allow listeners for settings changes to be created", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-settings")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		const settingsApi = engine.$.settings;

		let changeEventCalled = false;

		settingsApi.on("change", ({ new: newState, old: oldState }) => {
			expect(newState.musicEnabled).toEqual(false);
			expect(oldState.musicEnabled).toEqual(true);
			changeEventCalled = true;
		});

		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(changeEventCalled).toEqual(true);
	});

	it("should allow listeners for settings changes to be removed", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-with-simple-settings")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		const settingsApi = engine.$.settings;

		let changeEventCalled = false;

		const unsubscribe = settingsApi.on(
			"change",
			({ new: newState, old: oldState }) => {
				expect(newState.musicEnabled).toEqual(false);
				expect(oldState.musicEnabled).toEqual(true);
				changeEventCalled = true;
			},
		);

		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(changeEventCalled).toEqual(true);

		unsubscribe();

		engine.$.settings.set((state) => {
			state.musicEnabled = true;
		});

		expect(changeEventCalled).not.toEqual(false);
	});

	it("should support deep updates to nested settings state", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-deep-update")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		engine.$.settings.set((state) => {
			state.notifications.show = false;
			state.notifications.type = "mentions";
		});

		const result = engine.$.settings.get();

		expect(result.notifications.show).toEqual(false);
		expect(result.notifications.type).toEqual("mentions");
	});

	it("should allow multiple listeners and all should be called", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-multi-listener")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		let a = false,
			b = false;

		engine.$.settings.on("change", () => {
			a = true;
		});
		engine.$.settings.on("change", () => {
			b = true;
		});
		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(a).toEqual(true);
		expect(b).toEqual(true);
	});

	it("should handle rapid consecutive updates and emit correct events", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-rapid-updates")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		const events: {
			new: WidenedSimpleSettings;
			old: WidenedSimpleSettings;
		}[] = [];

		engine.$.settings.on("change", (e) => {
			events.push(e);
		});
		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});
		engine.$.settings.set((state) => {
			state.volume = 0.75;
		});
		engine.$.settings.set((state) => {
			state.volume = 0.2;
		});

		expect(events.length).toEqual(3);
		expect(events[0]?.new.musicEnabled).toEqual(false);
		expect(events[1]?.new.volume).toEqual(0.75);
		expect(events[2]?.new.volume).toEqual(0.2);
	});

	it("should not allow off() to remove unrelated listeners", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-off-test")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
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

		engine.$.settings.on("change", a);
		engine.$.settings.on("change", b);
		engine.$.settings.off("change", a);
		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(calledA).toEqual(false);
		expect(calledB).toEqual(true);
	});

	it("should support interactive fiction style: toggle, progress and reset settings", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-if-style")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		engine.$.settings.set((state) => {
			state.musicEnabled = false;
		});

		expect(engine.$.settings.get().musicEnabled).toEqual(false);

		engine.$.settings.set((state) => {
			state.volume = 1;
		});

		expect(engine.$.settings.get().volume).toEqual(1);

		engine.$.settings.set((state) => {
			state.musicEnabled = true;
			state.volume = 0.5;
			state.notifications.show = true;
			state.notifications.type = "all";
		});

		expect(engine.$.settings.get()).toEqual(createSimpleSettings());
	});

	it("should properly persist data when the save is exported from the engine", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("engine-settings-persistence")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		engine.$.settings.set((state) => {
			state.musicEnabled = false;
			state.notifications.show = false;
			state.notifications.type = "mentions";
			state.volume = 0.9;
		});

		await engine.$.settings.save();

		const exportedStr = await engine.saveToExport();

		expect(
			(
				deserialize(
					await decompressPossiblyCompressedJsonString(exportedStr),
				) as any
			)["plugins"]["settings"]["data"]["settings"],
		).toEqual({
			musicEnabled: false,
			notifications: {
				show: false,
				type: "mentions",
			},
			volume: 0.9,
		});

		const newEngine = await new SugarboxEngineBuilder()
			.withName("engine-settings-persistence-2")
			.withPlugin(simpleSettingsPlugin, {
				default: createSimpleSettings(),
			})
			.build();

		await newEngine.loadFromExport(exportedStr);

		expect(newEngine.$.settings.get()).toStrictEqual({
			musicEnabled: false,
			notifications: {
				show: false,
				type: "mentions",
			},
			volume: 0.9,
		});
	});
});
