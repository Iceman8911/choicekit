import { describe, expectTypeOf, it } from "bun:test";
import { definePlugin } from "../../plugins/plugin";
import { SugarboxEngineBuilder } from "../builder";
import { SugarboxEngine } from "./if-engine";

describe(SugarboxEngine.name, () => {
	it("should have strict types", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("Greg")
			.withVars({
				bar: 1,
				baz: 2n,
				foo: "",
				nested: { barbaz: 3n, foobar: "1" },
			})
			.withPassages(
				{
					data: "Greg",
					name: "Gregged",
					tags: ["Gregs", "2nd greg", "3rd grg :D"],
				},
				{ data: "Not Greg :(", name: "Not Gregged :((", tags: ["Greg???"] },
			)
			.withAchievements({ bar: 2 })
			.withSettings({ booze: 3n })
			.build();

		expectTypeOf(engine.name).toExtend<"Greg">();
		expectTypeOf(engine.vars.foo).toBeString();
		expectTypeOf(engine.vars.bar).toBeNumber();
		expectTypeOf(engine.vars.baz).toBeBigInt();
		expectTypeOf(engine.vars.nested.foobar).toBeString();
		expectTypeOf(engine.vars.nested.barbaz).toBeBigInt();
		expectTypeOf(engine.passageId).toBeString();
		expectTypeOf(engine.achievements.bar).toBeNumber();
		expectTypeOf(engine.settings.booze).toBeBigInt();
		expectTypeOf(engine.index).toBeNumber();
		expectTypeOf(engine.random).toBeNumber();

		const testPlugin = definePlugin({
			init(engine, config: { foo: string; bar: number }) {
				return {
					barFoo: [engine.random, config.bar, Number(config.foo)],
					foobar: `${config.foo} ${config.bar}`,
				};
			},
			name: "test",
			onOverride: "err",
		});

		const enginePlusPlugin = await engine.#usePlugin(testPlugin, {
			bar: 1,
			foo: "foo",
		});

		// Type assertions - checking that the plugin namespace is properly typed
		expectTypeOf(enginePlusPlugin.$.test).not.toBeUnknown();
		expectTypeOf(enginePlusPlugin.$.test).toHaveProperty("barFoo");
		expectTypeOf(enginePlusPlugin.$.test).toHaveProperty("foobar");

		// More detailed type checks on the plugin properties
		type TestPlugin = typeof enginePlusPlugin.$.test;
		expectTypeOf<TestPlugin>().toMatchTypeOf<{
			barFoo: readonly [number, number, number];
			foobar: string;
		}>();

		// Test plugin chaining - multiple plugins on the same engine
		const secondPlugin = definePlugin({
			init(_engine, config: { multiplier: bigint }) {
				return {
					isReady: true,
					multiply: (value: number) => BigInt(value) * config.multiplier,
				};
			},
			name: "second",
			onOverride: "err",
		} as const);

		const engineWithTwoPlugins = await enginePlusPlugin.#usePlugin(
			secondPlugin,
			{ multiplier: 10n },
		);

		// Verify both plugins are properly typed
		expectTypeOf(engineWithTwoPlugins.$.test).not.toBeUnknown();
		expectTypeOf(engineWithTwoPlugins.$.test).toHaveProperty("barFoo");
		expectTypeOf(engineWithTwoPlugins.$.test).toHaveProperty("foobar");

		expectTypeOf(engineWithTwoPlugins.$.second).not.toBeUnknown();
		expectTypeOf(engineWithTwoPlugins.$.second).toHaveProperty("multiply");
		expectTypeOf(engineWithTwoPlugins.$.second).toHaveProperty("isReady");
		expectTypeOf(engineWithTwoPlugins.$.second.isReady).toEqualTypeOf<true>();

		// Verify the plugin namespaces are distinct
		expectTypeOf(engineWithTwoPlugins.$).toHaveProperty("test");
		expectTypeOf(engineWithTwoPlugins.$).toHaveProperty("second");

		// Test 3: Verify "ignore" mode behavior at compile time
		const ignorePlugin = definePlugin({
			init(_engine, config: { shouldBeIgnored: boolean }) {
				return {
					thisWillNotExist: () => config.shouldBeIgnored,
				};
			},
			name: "test", // Same namespace as existing plugin
			onOverride: "ignore",
		} as const);

		const engineAfterIgnore = await enginePlusPlugin.#usePlugin(ignorePlugin, {
			shouldBeIgnored: true,
		});

		// Type should be unchanged - ignore mode returns `this` at compile time
		type EngineAfterIgnoreType = typeof engineAfterIgnore;
		type EngineBeforeIgnoreType = typeof enginePlusPlugin;

		// These types should be identical when using ignore mode on existing namespace
		expectTypeOf<EngineAfterIgnoreType>().toMatchTypeOf<EngineBeforeIgnoreType>();

		// Original plugin properties should still exist
		expectTypeOf(engineAfterIgnore.$.test).toHaveProperty("barFoo");
		expectTypeOf(engineAfterIgnore.$.test).toHaveProperty("foobar");

		// Verify the ignored plugin's properties are not present
		// The type should still be the original plugin's mutations
		type TestPluginType = typeof engineAfterIgnore.$.test;
		expectTypeOf<TestPluginType>().toMatchTypeOf<{
			barFoo: readonly [number, number, number];
			foobar: string;
		}>();
	});
});
