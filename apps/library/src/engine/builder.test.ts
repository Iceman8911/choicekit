import { describe, expectTypeOf, it } from "bun:test";
import { SugarboxEngineBuilder } from "../../src/engine/builder";
import { definePlugin } from "../plugins/plugin";

describe("SugarboxEngineBuilder - Plugin Type Accumulation", () => {
	it("should properly accumulate multiple plugin types in builder", async () => {
		// Define test plugins with distinct namespaces and types
		const mathPlugin = definePlugin({
			init(_engine, config: { multiplier: number }) {
				return {
					add: (a: number, b: number) => a + b,
					multiply: (x: number) => x * config.multiplier,
					result: 42,
				};
			},
			name: "math",
			onOverride: "err",
		} as const);

		const stringPlugin = definePlugin({
			init(_engine, config: { prefix: string }) {
				return {
					length: 100,
					prefix: (s: string) => config.prefix + s,
					uppercase: (s: string) => s.toUpperCase(),
				};
			},
			name: "strings",
			onOverride: "err",
		} as const);

		const booleanPlugin = definePlugin({
			init(_engine, config: { defaultValue: boolean }) {
				return {
					flagCount: 5n,
					isEnabled: config.defaultValue,
					toggle: (val: boolean) => !val,
				};
			},
			name: "flags",
			onOverride: "err",
		} as const);

		const dependentPlugin = definePlugin({
			dependencies: [
				[booleanPlugin, { defaultValue: true }],
				[stringPlugin, { prefix: "test-" }],
			],
			init(engine, config: { foo: boolean }) {
				return {
					isEnabled: engine.$.flags.toggle(config.foo),
					prefixedValue: engine.$.strings.prefix("hello"),
					stringLength: engine.$.strings.length,
				};
			},
			name: "dependent",
			onOverride: "err",
		});

		type DependentInitEngine = Parameters<typeof dependentPlugin.init>[0];
		type DependentEnginePlugins = DependentInitEngine["$"];

		expectTypeOf<DependentEnginePlugins>().toHaveProperty("flags");
		expectTypeOf<DependentEnginePlugins>().toHaveProperty("strings");
		expectTypeOf<DependentEnginePlugins["flags"]>().toHaveProperty("toggle");
		expectTypeOf<DependentEnginePlugins["flags"]>().toHaveProperty("isEnabled");
		expectTypeOf<DependentEnginePlugins["strings"]>().toHaveProperty("prefix");
		expectTypeOf<DependentEnginePlugins["strings"]>().toHaveProperty(
			"uppercase",
		);

		// Build engine with multiple plugins
		const engine = await new SugarboxEngineBuilder()
			.withName("test-engine")
			.withVars({ counter: 0 })
			.withPassages({ data: "Starting passage", name: "start", tags: [] })
			.withConfig({
				autoSave: false,
				compress: false,
				loadOnStart: false,
				maxStates: 10,
				regenSeed: false,
				saveCompat: "strict",
				saveSlots: 3,
				saveVersion: "1.0.0",
				stateMergeCount: 5,
			})
			.withPlugin(mathPlugin, { multiplier: 2 })
			.withPlugin(stringPlugin, { prefix: ">>>" })
			.withPlugin(booleanPlugin, { defaultValue: true })
			.build();

		// TEST 1: Verify all three plugin namespaces exist
		expectTypeOf(engine.$).toHaveProperty("math");
		expectTypeOf(engine.$).toHaveProperty("strings");
		expectTypeOf(engine.$).toHaveProperty("flags");

		// TEST 2: Verify math plugin types
		expectTypeOf(engine.$.math).not.toBeUnknown();
		expectTypeOf(engine.$.math).toHaveProperty("multiply");
		expectTypeOf(engine.$.math).toHaveProperty("add");
		expectTypeOf(engine.$.math).toHaveProperty("result");

		expectTypeOf(engine.$.math.multiply).toBeFunction();
		expectTypeOf(engine.$.math.add).toBeFunction();

		expectTypeOf(engine.$.math.result).toEqualTypeOf<42>();

		// TEST 3: Verify strings plugin types
		expectTypeOf(engine.$.strings).not.toBeUnknown();
		expectTypeOf(engine.$.strings).toHaveProperty("prefix");
		expectTypeOf(engine.$.strings).toHaveProperty("uppercase");
		expectTypeOf(engine.$.strings).toHaveProperty("length");

		expectTypeOf(engine.$.strings.prefix).toBeFunction();
		expectTypeOf(engine.$.strings.uppercase).toBeFunction();

		expectTypeOf(engine.$.strings.length).toEqualTypeOf<100>();

		// TEST 4: Verify flags plugin types
		expectTypeOf(engine.$.flags).not.toBeUnknown();
		expectTypeOf(engine.$.flags).toHaveProperty("toggle");
		expectTypeOf(engine.$.flags).toHaveProperty("isEnabled");
		expectTypeOf(engine.$.flags).toHaveProperty("flagCount");

		expectTypeOf(engine.$.flags.toggle).toBeFunction();

		expectTypeOf(engine.$.flags.isEnabled).toBeBoolean();
		expectTypeOf(engine.$.flags.flagCount).toBeBigInt();

		// TEST 5: Verify dependent plugin types when built
		const engineWithDependent = await new SugarboxEngineBuilder()
			.withName("dependent-test")
			.withVars({ counter: 0 })
			.withPassages({ data: "Starting", name: "start", tags: [] })
			.withConfig({
				autoSave: false,
				compress: false,
				loadOnStart: false,
				maxStates: 10,
				regenSeed: false,
				saveCompat: "strict",
				saveSlots: 3,
				saveVersion: "1.0.0",
				stateMergeCount: 5,
			})
			.withPlugin(dependentPlugin, { foo: false })
			.build();

		expectTypeOf(engineWithDependent.$).toHaveProperty("dependent");
		expectTypeOf(engineWithDependent.$.dependent).toHaveProperty("isEnabled");
		expectTypeOf(engineWithDependent.$.dependent).toHaveProperty(
			"stringLength",
		);
		expectTypeOf(engineWithDependent.$.dependent).toHaveProperty(
			"prefixedValue",
		);

		// TEST 6: Verify that all plugins coexist (no type override issues)
		type PluginsObject = typeof engine.$;
		expectTypeOf<PluginsObject>().toMatchTypeOf<{
			math: {
				multiply: (x: number) => number;
				add: (a: number, b: number) => number;
				result: 42;
			};
			strings: {
				prefix: (s: string) => string;
				uppercase: (s: string) => string;
				length: 100;
			};
			flags: {
				toggle: (val: boolean) => boolean;
				isEnabled: boolean;
				flagCount: bigint;
			};
		}>();
	});

	it("should handle single plugin correctly", async () => {
		const soloPlugin = definePlugin({
			init(_engine, config: { value: string }) {
				return {
					getValue: () => config.value,
				};
			},
			name: "solo",
			onOverride: "err",
		} as const);

		const engine = await new SugarboxEngineBuilder()
			.withName("solo-test")
			.withVars({ x: 1 })
			.withPassages({ data: "test", name: "start", tags: [] })
			.withConfig({
				autoSave: false,
				compress: false,
				loadOnStart: false,
				maxStates: 10,
				regenSeed: false,
				saveCompat: "strict",
				saveSlots: 3,
				saveVersion: "1.0.0",
				stateMergeCount: 5,
			})
			.withPlugin(soloPlugin, { value: "test" })
			.build();

		expectTypeOf(engine.$).toHaveProperty("solo");
		expectTypeOf(engine.$.solo).toHaveProperty("getValue");
		expectTypeOf(engine.$.solo.getValue).toBeFunction();
	});
});
