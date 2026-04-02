import { describe, expect, expectTypeOf, it } from "bun:test";
import { definePlugin, type ValidatePluginGenerics } from "../plugins/plugin";
import { SugarboxEngineBuilder } from "./builder";

type MathPluginGenerics = ValidatePluginGenerics<{
	id: "math";
	config: { multiplier: number };
	api: {
		add: (a: number, b: number) => number;
		multiply: (x: number) => number;
		result: 42;
	};
	dependencies: [];
}>;

const mathPlugin = definePlugin<MathPluginGenerics>({
	id: "math",
	initApi({ config }) {
		return {
			add: (a, b) => a + b,
			multiply: (x) => x * config.multiplier,
			result: 42 as const,
		};
	},
	onOverride: "err",
});

type StringPluginGenerics = ValidatePluginGenerics<{
	id: "strings";
	config: { prefix: string };
	api: {
		length: 100;
		prefix: (s: string) => string;
		uppercase: (s: string) => string;
	};
	dependencies: [];
}>;

const stringPlugin = definePlugin<StringPluginGenerics>({
	id: "strings",
	initApi({ config }) {
		return {
			length: 100 as const,
			prefix: (s) => `${config.prefix}${s}`,
			uppercase: (s) => s.toUpperCase(),
		};
	},
	onOverride: "err",
});

type FlagsPluginGenerics = ValidatePluginGenerics<{
	id: "flags";
	config: { defaultValue: boolean };
	api: {
		flagCount: bigint;
		isEnabled: boolean;
		toggle: (val: boolean) => boolean;
	};
	dependencies: [];
}>;

const booleanPlugin = definePlugin<FlagsPluginGenerics>({
	id: "flags",
	initApi({ config }) {
		return {
			flagCount: 5n,
			isEnabled: config.defaultValue,
			toggle: (value) => !value,
		};
	},
	onOverride: "err",
});

type DependentPluginGenerics = ValidatePluginGenerics<{
	id: "dependent";
	config: { foo: boolean };
	api: {
		isEnabled: boolean;
		prefixedValue: string;
		stringLength: number;
		status: (verbose: boolean) => string;
	};
	dependencies: [typeof booleanPlugin, typeof stringPlugin];
}>;

const dependentPlugin = definePlugin<DependentPluginGenerics>({
	dependencies: [
		{ config: { defaultValue: true }, plugin: booleanPlugin },
		{ config: { prefix: "test-" }, plugin: stringPlugin },
	],
	id: "dependent",
	initApi({ engine, config }) {
		return {
			isEnabled: engine.$.flags.toggle(config.foo),
			prefixedValue: engine.$.strings.prefix("hello"),
			status: (verbose: boolean) =>
				verbose
					? `${engine.$.strings.prefix("hello")}:${engine.$.flags.flagCount}`
					: "ok",
			stringLength: engine.$.strings.length,
		};
	},
	onOverride: "err",
});

describe("SugarboxEngineBuilder - Plugin Type Accumulation", () => {
	it("should properly accumulate multiple plugin types in builder", async () => {
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

		expectTypeOf(engine.$).toHaveProperty("math");
		expectTypeOf(engine.$).toHaveProperty("strings");
		expectTypeOf(engine.$).toHaveProperty("flags");

		expectTypeOf(engine.$.math.add).toBeFunction();
		expectTypeOf(engine.$.math.multiply).toBeFunction();
		expectTypeOf(engine.$.math.result).toEqualTypeOf<42>();

		expectTypeOf(engine.$.strings.prefix).toBeFunction();
		expectTypeOf(engine.$.strings.uppercase).toBeFunction();
		expectTypeOf(engine.$.strings.length).toEqualTypeOf<100>();

		expectTypeOf(engine.$.flags.toggle).toBeFunction();
		expectTypeOf(engine.$.flags.isEnabled).toBeBoolean();
		expectTypeOf(engine.$.flags.flagCount).toBeBigInt();

		expectTypeOf(dependentPlugin.dependencies).toExtend<
			readonly [
				{ plugin: typeof booleanPlugin; config: { defaultValue: boolean } },
				{ plugin: typeof stringPlugin; config: { prefix: string } },
			]
		>();

		type DepDependentEngine = Parameters<
			NonNullable<typeof dependentPlugin.initApi>
		>[0]["engine"];

		expectTypeOf<DepDependentEngine["$"]>().toHaveProperty("flags");
		expectTypeOf<DepDependentEngine["$"]>().toHaveProperty("strings");

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
			.withPlugin(booleanPlugin, { defaultValue: true })
			.withPlugin(stringPlugin, { prefix: "test-" })
			.withPlugin(dependentPlugin, { foo: false })
			.build();

		expectTypeOf(engineWithDependent.$).toHaveProperty("dependent");
		expectTypeOf(engineWithDependent.$.dependent.status).toBeFunction();
		expectTypeOf(engineWithDependent.$.dependent.isEnabled).toBeBoolean();
		expectTypeOf(engineWithDependent.$.dependent.prefixedValue).toBeString();
		expectTypeOf(engineWithDependent.$.dependent.stringLength).toBeNumber();

		type PluginsObject = typeof engine.$;

		expectTypeOf<PluginsObject>().toExtend<{
			math: {
				add: (a: number, b: number) => number;
				multiply: (x: number) => number;
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
		const soloPlugin = definePlugin<
			ValidatePluginGenerics<{
				id: "solo";
				config: { value: string };
				api: { getValue: () => string };
				dependencies: [];
			}>
		>({
			id: "solo",
			initApi({ config }) {
				return {
					getValue: () => config.value,
				};
			},
			onOverride: "err",
		});

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
		expectTypeOf(engine.$.solo.getValue).toBeFunction();
	});

	it("should reject invalid save slot configuration at build time", async () => {
		await expect(
			new SugarboxEngineBuilder()
				.withName("invalid-config")
				.withVars({ x: 1 })
				.withPassages({ data: "test", name: "start", tags: [] })
				.withConfig({
					autoSave: false,
					compress: false,
					loadOnStart: false,
					maxStates: 10,
					regenSeed: false,
					saveCompat: "strict",
					saveSlots: -1,
					saveVersion: "1.0.0",
					stateMergeCount: 5,
				})
				.build(),
		).rejects.toThrow();
	});
});
