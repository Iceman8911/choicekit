import { describe, expect, expectTypeOf, it } from "bun:test";
import type { SugarBoxSemanticVersionString } from "../utils/version";
import { definePlugin, type ValidatePluginGenerics } from "./plugin";

describe("Sugarbox Plugins", () => {
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
			SugarBoxSemanticVersionString | undefined
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
		).toEqualTypeOf<SugarBoxSemanticVersionString>();
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
});
