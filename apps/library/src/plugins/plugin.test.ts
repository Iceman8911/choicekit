import { describe, expect, expectTypeOf, it } from "bun:test";
import type { ChoicekitSemanticVersionString } from "../_internal/utils/version";
import { ChoicekitEngine } from "../engine/if-engine";
import {
	type ChoicekitEngineWithPluginApis,
	definePlugin,
	type MapPluginsToApiSurface,
	type ValidatePluginGenerics,
} from "./plugin";

describe("Choicekit Plugins", () => {
	it("should strongly type basic plugins with simple types", () => {
		type SimplePluginGenerics = ValidatePluginGenerics<{
			id: "simple";
			config: {
				value: number;
			};
			api: { result: number };
			state: { foo: string };
		}>;

		const simplePlugin = definePlugin<SimplePluginGenerics>({
			id: "simple",
			initApi({ config }) {
				return { result: config.value * 2 };
			},
			initState() {
				return { foo: "foo" };
			},
			onOverride: "err",
		});

		expectTypeOf(simplePlugin.id).toEqualTypeOf<"simple">();

		// initState resolves to the declared state shape
		expectTypeOf<
			Awaited<ReturnType<typeof simplePlugin.initState>>
		>().toEqualTypeOf<{
			foo: string;
		}>();

		// initApi returns the declared api shape
		expectTypeOf<
			Awaited<ReturnType<typeof simplePlugin.initApi>>
		>().toEqualTypeOf<{
			result: number;
		}>();

		// initApi receives the config and state in its first parameter
		type InitApiParam = Parameters<typeof simplePlugin.initApi>[0];
		expectTypeOf<InitApiParam>().toExtend<{
			config: { value: number };
			state: { foo: string };
		}>();
	});

	it("should type serialized state methods and onDeserialize correctly", () => {
		type SerialPluginGenerics = ValidatePluginGenerics<{
			id: "serial";
			state: { count: number };
			serializedState: { count: number };
		}>;

		const serialPlugin = definePlugin<SerialPluginGenerics>({
			id: "serial",
			initState() {
				return { count: 0 };
			},
			onDeserialize({ data, state }) {
				state.count = data.count;
			},
			serialize: {
				method(state) {
					return { count: state.count };
				},
				withSave: true,
			},
		});

		// onDeserialize first parameter has correctly-typed data and state
		type OnDeserializeParam = Parameters<typeof serialPlugin.onDeserialize>[0];
		expectTypeOf<OnDeserializeParam["state"]>().toEqualTypeOf<{
			count: number;
		}>();
		expectTypeOf<OnDeserializeParam["version"]>().toEqualTypeOf<
			ChoicekitSemanticVersionString | undefined
		>();
	});

	it("should respect explicit overrideBehaviour generic and default behaviour type", () => {
		type ExplicitOverrideGenerics = ValidatePluginGenerics<{
			id: "explicit-override";
			overrideBehaviour: "ignore";
		}>;

		const explicitOverridePlugin = definePlugin<ExplicitOverrideGenerics>({
			id: "explicit-override",
			onOverride: "ignore",
		});

		expectTypeOf<
			(typeof explicitOverridePlugin)["onOverride"]
		>().toEqualTypeOf<"ignore">();
		expect(explicitOverridePlugin.onOverride).toBe("ignore");
	});

	// TODO: make these examples / tests more relevant
	it("should type dependencies and engine augmentation correctly", () => {
		// Logger plugin depends only on config + API
		type LoggerGenerics = ValidatePluginGenerics<{
			id: "logger";
			config: { level: "info" | "debug" };
			api: { log: (s: string) => boolean };
		}>;

		const loggerPlugin = definePlugin<LoggerGenerics>({
			id: "logger",
			initApi() {
				return { log: (s: string) => !!s };
			},
		});

		// Auth plugin exposes a simple API
		type AuthGenerics = ValidatePluginGenerics<{
			id: "auth";
			config: { token: string };
			api: {
				userId: string | null;
			};
			state: { session: string | null };
		}>;

		const authPlugin = definePlugin<AuthGenerics>({
			id: "auth",
			initApi() {
				return { userId: null };
			},
			initState() {
				return { session: null };
			},
		});

		// Types for plugin values
		type LoggerType = typeof loggerPlugin;
		type AuthType = typeof authPlugin;

		// Application plugin that depends on logger and auth
		type AppGenerics = ValidatePluginGenerics<{
			id: "app";
			dependencies: [LoggerType, AuthType];
			config: { name: string };
			api: { start: () => string };
		}>;

		const appPlugin = definePlugin<AppGenerics>({
			dependencies: [
				{ config: { level: "info" }, plugin: loggerPlugin },
				{ config: { token: "token" }, plugin: authPlugin },
			],
			id: "app",
			initApi({ engine, config }) {
				return {
					start: () =>
						`${engine.$.auth.userId}-${engine.$.logger.log(config.name)}-${config.name}`,
				};
			},
			version: "1.2.3",
		});

		// dependencies property exists and is a tuple matching the declared dependencies
		expectTypeOf(appPlugin.dependencies).toExtend<
			readonly [
				{ plugin: LoggerType; config: { level: "info" | "debug" } },
				{ plugin: AuthType; config: { token: string } },
			]
		>();

		// version uses semantic version string type (or undefined)
		expectTypeOf(
			appPlugin.version,
		).toEqualTypeOf<ChoicekitSemanticVersionString>();
	});

	it("should allow omitting optional properties like dependencies and serializedState", () => {
		type MinimalGenerics = ValidatePluginGenerics<{
			id: "minimal";
		}>;

		const minimalPlugin = definePlugin<MinimalGenerics>({
			id: "minimal",
		});

		expect(minimalPlugin.dependencies).toStrictEqual([]);
		expect(minimalPlugin.serialize).toBeUndefined();
		expect(minimalPlugin.onDeserialize).toBeUndefined();
	});

	it("should map plugin tuples to api namespaces and augment engine types", () => {
		type AchievementsLikeGenerics = ValidatePluginGenerics<{
			id: "achievements";
			api: {
				get: () => { completed: boolean };
			};
		}>;

		type SettingsLikeGenerics = ValidatePluginGenerics<{
			id: "settings";
			api: {
				get: () => { storyletsEnabled: boolean };
			};
		}>;

		const achievementsLikePlugin = definePlugin<AchievementsLikeGenerics>({
			id: "achievements",
			initApi() {
				return {
					get: () => ({ completed: false }),
				};
			},
		});

		const settingsLikePlugin = definePlugin<SettingsLikeGenerics>({
			id: "settings",
			initApi() {
				return {
					get: () => ({ storyletsEnabled: true }),
				};
			},
		});

		type PluginTuple = [
			typeof achievementsLikePlugin,
			typeof settingsLikePlugin,
		];

		type Surface = MapPluginsToApiSurface<PluginTuple>;
		expectTypeOf<Surface>().toEqualTypeOf<{
			achievements: { get: () => { completed: boolean } };
			settings: { get: () => { storyletsEnabled: boolean } };
		}>();

		type EngineWithApis = ChoicekitEngineWithPluginApis<
			ChoicekitEngine,
			PluginTuple
		>;
		expectTypeOf<EngineWithApis["$"]>().toMatchTypeOf<{
			achievements: { get: () => { completed: boolean } };
			settings: { get: () => { storyletsEnabled: boolean } };
		}>();
	});

	it("should infer and mount deeply nested dependency APIs at runtime", async () => {
		type CounterGenerics = ValidatePluginGenerics<{
			id: "counter";
			config: { initial: number };
			state: { value: number };
			api: {
				increment: () => number;
				get: () => number;
			};
		}>;

		type FormatterGenerics = ValidatePluginGenerics<{
			id: "formatter";
			config: { prefix: string };
			api: {
				format: (value: number) => string;
			};
		}>;

		const counterPlugin = definePlugin<CounterGenerics>({
			id: "counter",
			initApi({ state, config }) {
				state.value = config.initial;

				return {
					get: () => state.value,
					increment: () => {
						state.value += 1;
						return state.value;
					},
				};
			},
			initState() {
				return {
					value: 0,
				};
			},
		});

		const formatterPlugin = definePlugin<FormatterGenerics>({
			id: "formatter",
			initApi({ config }) {
				return {
					format: (value: number) => `${config.prefix}${value}`,
				};
			},
		});

		type MidGenerics = ValidatePluginGenerics<{
			id: "mid";
			dependencies: [typeof counterPlugin, typeof formatterPlugin];
			config: { multiplier: number };
			api: {
				computeLabel: () => string;
				raw: () => number;
			};
		}>;

		const midPlugin = definePlugin<MidGenerics>({
			dependencies: [
				{ config: { initial: 7 }, plugin: counterPlugin },
				{ config: { prefix: "value=" }, plugin: formatterPlugin },
			],
			id: "mid",
			initApi({ engine, config }) {
				return {
					computeLabel: () => {
						const next = engine.$.counter.increment();
						return engine.$.formatter.format(next * config.multiplier);
					},
					raw: () => engine.$.counter.get(),
				};
			},
		});

		type RootGenerics = ValidatePluginGenerics<{
			id: "root";
			dependencies: [typeof midPlugin];
			config: { suffix: string };
			api: {
				summary: () => string;
			};
		}>;

		const rootPlugin = definePlugin<RootGenerics>({
			dependencies: [{ config: { multiplier: 3 }, plugin: midPlugin }],
			id: "root",
			initApi({ engine, config }) {
				return {
					summary: () => `${engine.$.mid.computeLabel()}${config.suffix}`,
				};
			},
		});

		type NestedTuple = [typeof rootPlugin];
		type NestedSurface = MapPluginsToApiSurface<NestedTuple>;

		expectTypeOf<NestedSurface>().toEqualTypeOf<{
			counter: {
				increment: () => number;
				get: () => number;
			};
			formatter: {
				format: (value: number) => string;
			};
			mid: {
				computeLabel: () => string;
				raw: () => number;
			};
			root: {
				summary: () => string;
			};
		}>();

		type EngineWithNestedApis = ChoicekitEngineWithPluginApis<
			ChoicekitEngine,
			NestedTuple
		>;

		expectTypeOf<EngineWithNestedApis["$"]>().toMatchTypeOf<{
			counter: {
				increment: () => number;
				get: () => number;
			};
			formatter: {
				format: (value: number) => string;
			};
			mid: {
				computeLabel: () => string;
				raw: () => number;
			};
			root: {
				summary: () => string;
			};
		}>();

		const engine = await ChoicekitEngine.init<{
			name: string;
			vars: Record<string, never>;
			settings: Record<string, never>;
			achievements: Record<string, never>;
			passages: {
				name: "start";
				data: string;
				tags: [];
			};
			plugins: NestedTuple;
		}>({
			achievements: {},
			name: "nested-plugin-test",
			passages: [{ data: "", name: "start", tags: [] }],
			plugins: [{ config: { suffix: "!" }, plugin: rootPlugin }],
			settings: {},
			vars: {},
		});

		// Every dependency level is mounted and callable at runtime.
		expect(engine.$.counter.get()).toBe(7);
		expect(engine.$.formatter.format(5)).toBe("value=5");
		expect(engine.$.mid.raw()).toBe(7);
		expect(engine.$.mid.computeLabel()).toBe("value=24");
		expect(engine.$.root.summary()).toBe("value=27!");
		expect(engine.$.counter.get()).toBe(9);
	});

	it("should mount sibling branch dependencies and initialize shared duplicate dependencies once", async () => {
		let sharedInitApiCalls = 0;

		type SharedGenerics = ValidatePluginGenerics<{
			id: "sharedMath";
			config: { base: number };
			state: { value: number };
			api: {
				add: (n: number) => number;
				get: () => number;
				getBase: () => number;
			};
		}>;

		const sharedPlugin = definePlugin<SharedGenerics>({
			id: "sharedMath",
			initApi({ config, state }) {
				sharedInitApiCalls += 1;
				state.value = config.base;

				return {
					add: (n: number) => {
						state.value += n;
						return state.value;
					},
					get: () => state.value,
					getBase: () => config.base,
				};
			},
			initState() {
				return { value: 0 };
			},
		});

		type LeftGenerics = ValidatePluginGenerics<{
			id: "leftBranch";
			dependencies: [typeof sharedPlugin];
			config: { step: number };
			api: {
				bumpLeft: () => number;
			};
		}>;

		const leftPlugin = definePlugin<LeftGenerics>({
			dependencies: [{ config: { base: 10 }, plugin: sharedPlugin }],
			id: "leftBranch",
			initApi({ config, engine }) {
				return {
					bumpLeft: () => engine.$.sharedMath.add(config.step),
				};
			},
		});

		type RightGenerics = ValidatePluginGenerics<{
			id: "rightBranch";
			dependencies: [typeof sharedPlugin];
			config: { step: number };
			api: {
				bumpRight: () => number;
			};
		}>;

		const rightPlugin = definePlugin<RightGenerics>({
			dependencies: [{ config: { base: 999 }, plugin: sharedPlugin }],
			id: "rightBranch",
			initApi({ config, engine }) {
				return {
					bumpRight: () => engine.$.sharedMath.add(config.step * 2),
				};
			},
		});

		type RootGenerics = ValidatePluginGenerics<{
			id: "rootTree";
			dependencies: [typeof leftPlugin, typeof rightPlugin];
			api: {
				run: () => {
					left: number;
					right: number;
					value: number;
					base: number;
				};
			};
		}>;

		const rootPlugin = definePlugin<RootGenerics>({
			dependencies: [
				{ config: { step: 2 }, plugin: leftPlugin },
				{ config: { step: 3 }, plugin: rightPlugin },
			],
			id: "rootTree",
			initApi({ engine }) {
				return {
					run: () => {
						const left = engine.$.leftBranch.bumpLeft();
						const right = engine.$.rightBranch.bumpRight();
						return {
							base: engine.$.sharedMath.getBase(),
							left,
							right,
							value: engine.$.sharedMath.get(),
						};
					},
				};
			},
		});

		type NestedTuple = [typeof rootPlugin];
		type NestedSurface = MapPluginsToApiSurface<NestedTuple>;

		expectTypeOf<NestedSurface>().toEqualTypeOf<{
			sharedMath: {
				add: (n: number) => number;
				get: () => number;
				getBase: () => number;
			};
			leftBranch: {
				bumpLeft: () => number;
			};
			rightBranch: {
				bumpRight: () => number;
			};
			rootTree: {
				run: () => {
					left: number;
					right: number;
					value: number;
					base: number;
				};
			};
		}>();

		const engine = await ChoicekitEngine.init<{
			name: string;
			vars: Record<string, never>;
			settings: Record<string, never>;
			achievements: Record<string, never>;
			passages: {
				name: "start";
				data: string;
				tags: [];
			};
			plugins: NestedTuple;
		}>({
			achievements: {},
			name: "sibling-branches-shared-dep-test",
			passages: [{ data: "", name: "start", tags: [] }],
			plugins: [{ config: {}, plugin: rootPlugin }],
			settings: {},
			vars: {},
		});

		// Shared dependency should mount exactly once even when requested by both branches.
		expect(sharedInitApiCalls).toBe(1);
		expect(engine.$.sharedMath.getBase()).toBe(10);
		expect(engine.$.sharedMath.get()).toBe(10);

		expect(engine.$.leftBranch.bumpLeft()).toBe(12);
		expect(engine.$.rightBranch.bumpRight()).toBe(18);

		expect(engine.$.rootTree.run()).toStrictEqual({
			base: 10,
			left: 20,
			right: 26,
			value: 26,
		});
	});
});
