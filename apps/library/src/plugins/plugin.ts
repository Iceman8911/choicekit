import {
	clone,
	type TransformableOrJsonSerializableType,
} from "@packages/serializer";
import type { Promisable } from "type-fest";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../_internal/models/shared";
import type { ChoicekitSemanticVersionString } from "../_internal/utils/version";
import type { ChoicekitEngine } from "../engine/if-engine";

type ChoicekitPluginBehaviourOnOverride = "err" | "ignore" | "override";

type ChoicekitPlugins = ReadonlyArray<ChoicekitPlugin>;

type MapPluginsToPluginAndConfigTuple<TPlugins extends ChoicekitPlugins> = {
	[K in keyof TPlugins]: TPlugins[K] extends ChoicekitPlugin
		? {
				readonly plugin: TPlugins[K];
				readonly config: InferConfigFromPlugin<TPlugins[K]>;
			}
		: TPlugins[K];
};

export interface ChoicekitPluginInputGenerics {
	/** Unique id / name / namespace.
	 *
	 * Only one plugin can be mounted at a time on the engine with the same id.
	 *
	 * NOTE: CHANGING THIS WILL BREAK PLUGIN SAVES
	 */
	readonly id: string;

	/** Optional configuration exposed to users when your plugin should behave differently under situations */
	readonly config?: GenericObject;

	/** Optional internal state isolated to a single engine instance.
	 *
	 * Ideal since you'd otherwise have to fiddle with weakmaps for partitioned state
	 */
	readonly state?: GenericObject;

	/** Optional engine structure that this plugin supports.
	 *
	 * You will likely not have to modify this.
	 */
	readonly engine?: ChoicekitEngine;

	/** All the public props and functionality the plugin will attach the given namespace on the engine */
	readonly api?: GenericObject;

	/** How the engine will resolve "conflicts" when multiple plugins try to mount onto the same namespace
	 *
	 * @default "err"
	 */
	readonly overrideBehaviour?: ChoicekitPluginBehaviourOnOverride;

	/** Optional external plugins this plugin needs to be mounted beforehand. */
	readonly dependencies?: ChoicekitPlugins;

	/** Optional data shape if you need to persist some plugin state. */
	readonly serializedState?: GenericSerializableObject;
}

/** Typed helper for creating your plugin's generics with autocomplete on any competent IDE */
export type ValidatePluginGenerics<
	TGenerics extends ChoicekitPluginInputGenerics,
> = TGenerics;

type InferConfigFromPlugin<TPlugin extends ChoicekitPlugin> =
	TPlugin extends ChoicekitPlugin<infer RGenerics>
		? RGenerics["config"]
		: ChoicekitPluginInputGenerics["config"];

type NormalizeState<TState extends GenericObject | undefined> =
	undefined extends TState
		? GenericObject
		: TState extends undefined
			? GenericObject
			: TState;
type NormalizeEngine<TEngine extends ChoicekitEngine | undefined> =
	undefined extends TEngine
		? ChoicekitEngine
		: TEngine extends undefined
			? ChoicekitEngine
			: TEngine;
type NormalizeApi<TApi extends GenericObject | undefined> =
	undefined extends TApi
		? GenericObject
		: TApi extends undefined
			? GenericObject
			: TApi;
type NormalizeOverrideBehaviour<
	TOverride extends ChoicekitPluginBehaviourOnOverride | undefined,
> = undefined extends TOverride
	? ChoicekitPluginBehaviourOnOverride
	: TOverride extends undefined
		? ChoicekitPluginBehaviourOnOverride
		: TOverride;
type NormalizeDependencies<TDeps extends ChoicekitPlugins | undefined> =
	undefined extends TDeps
		? ChoicekitPlugins
		: TDeps extends undefined
			? ChoicekitPlugins
			: TDeps;
type NormalizeSerializedState<
	TSerialized extends TransformableOrJsonSerializableType | undefined,
> = undefined extends TSerialized
	? any
	: TSerialized extends undefined
		? any
		: TSerialized;

type AddDependenciesToEngine<
	TEngine extends ChoicekitEngine,
	TDeps extends ChoicekitPlugins,
> =
	TEngine extends ChoicekitEngine<infer REngineGenerics>
		? ChoicekitEngine<
				REngineGenerics & {
					plugins: [...REngineGenerics["plugins"], ...TDeps];
				}
			>
		: ChoicekitEngine;

interface ChoicekitPluginSerializeConfig<
	TNormalState extends GenericObject | undefined,
	TSerializedState extends TransformableOrJsonSerializableType,
> {
	/** Whether the plugin's save data should be stored and loaded alongside regular save data, or be stored and loaded with the export data.
	 *
	 * I.e. whether the state of this plugin should be influenced when a user loads a previous save.
	 *
	 * E.g. stuff like achievements and settings should not be affected when the user loads a previous state, so a plugin implementing these should set this to `false`.
	 */
	readonly withSave: boolean;

	/** The method that serializes and returns the plugin's internal state.
	 *
	 * DO NOT MUTATE THE `state` ARGUMENT.
	 */
	method(state: TNormalState): Promisable<TSerializedState>;
}

interface BaseChoicekitPlugin<TGenerics extends ChoicekitPluginInputGenerics> {
	/** Serves as the unique namespace and id on the engine instance where all methods and functionality are mounted.
	 *
	 * All ids/namespaces are within an object `$`, e.g `engine.$.storylet`
	 *
	 * If multiple plugins have the same namespace, plugin instantiation throws.
	 *
	 * NOTE: CHANGING THIS WILL BREAK PLUGIN SAVES
	 */
	readonly id: TGenerics["id"];

	/** How the engine should react when another plugin directly / indeirectly attempts to register itself on the same namespace.
	 *
	 * `err` - Keep original plugin, throw an error
	 *
	 * `ignore` - Keep original plugin, no error is thrown, but it is logged
	 *
	 * `override` - Override original plugin, no error is thrown, but it is logged
	 *
	 * @default "err"
	 */
	readonly onOverride?: NormalizeOverrideBehaviour<
		TGenerics["overrideBehaviour"]
	>;

	/** Other plugins and their configs that must be loaded before hand.
	 *
	 * @default []
	 */
	readonly dependencies?: MapPluginsToPluginAndConfigTuple<
		NormalizeDependencies<TGenerics["dependencies"]>
	>;

	/** Save data version for help with migrations.
	 *
	 * @default "0.0.1"
	 */
	version?: ChoicekitSemanticVersionString;
}

type OptionalizeIfUndefined<TValue, TShape> = undefined extends TValue
	? Partial<TShape>
	: TShape;

type ConditionalStatePluginExtension<
	TGenerics extends ChoicekitPluginInputGenerics,
> = OptionalizeIfUndefined<
	TGenerics["state"],
	{
		/** Use this to initialize any per-engine state, e.g. event targets for event stuff, private data, etc.
		 *
		 * NOTE: This function must be PURE and must return a deep-copy (i.e. if this is called a 100 times, none of the results (or any of their descendant props) must be referentially equivalent).
		 */
		initState(): Promisable<NormalizeState<TGenerics["state"]>>;
	}
>;

type ConditionalApiPluginExtension<
	TGenerics extends ChoicekitPluginInputGenerics,
> = OptionalizeIfUndefined<
	TGenerics["api"],
	{
		/** Use this to attach public functionality to the engine under the plugin's id/namespace.
		 *
		 * This is where the bulk of the plugin's functionality wil lie. Use this handler to setup listeners to events from the engine and / or other plugins.
		 *
		 * All dependencies will be loaded into the engine before this will ever be called.
		 */
		initApi(
			arg: {
				/** Choicekit Engine for you to do all you need */
				engine: AddDependenciesToEngine<
					NormalizeEngine<TGenerics["engine"]>,
					NormalizeDependencies<TGenerics["dependencies"]>
				>;

				/** Tells the engine to immediately try saving this plugin's data to it's isolated storage area.
				 *
				 * Only useful if the plugin's save data isn't bounded to the actual story data, i.e `serialize.withSave` is `false`
				 */
				triggerSave(): Promise<void>;
			} & (undefined extends TGenerics["config"]
				? {
						/** No config provided */
						config: any;
					}
				: {
						/** User-provided config where applicable */
						config: TGenerics["config"];
					}) &
				(undefined extends TGenerics["state"]
					? {
							/** No state provided */
							state: any;
						}
					: {
							/** Mutable plugin state.
							 *
							 * Just mutate the props if you must.
							 */
							state: TGenerics["state"];
						}),
		): Promisable<NormalizeApi<TGenerics["api"]>>;
	}
>;

type ConditionalSerializedStatePluginExtension<
	TGenerics extends ChoicekitPluginInputGenerics,
> = OptionalizeIfUndefined<
	TGenerics["serializedState"],
	{
		/** If you need persistent state, implement this property. */
		readonly serialize: ChoicekitPluginSerializeConfig<
			TGenerics["state"],
			NormalizeSerializedState<TGenerics["serializedState"]>
		>;

		/**
		 * This is called whenever the engine is triggered to load a save, matching `serialize?.withSave`'s behaviour.
		 *
		 * Use this for restoring the plugin's internal state.
		 *
		 * You can run save-data migrations here.
		 *
		 * @param data
		 * @param version
		 */
		onDeserialize(
			arg: {
				/** The result of `serialize?.method()` */
				data: NormalizeSerializedState<TGenerics["serializedState"]>;

				/** The version of the plugin that created the serialized state last.
				 *
				 * Useful for migrations
				 */
				version?: ChoicekitSemanticVersionString;
			} & (undefined extends TGenerics["state"]
				? {
						/** No state provided */
						state: any;
					}
				: {
						/** Internal state of the plugin that may be updated here.
						 *
						 * `NOTE`: Do not try to reassign this variable. Only mutate it's properties.
						 */
						state: TGenerics["state"];
					}),
		): Promisable<void>;
	}
>;

export type ChoicekitPlugin<
	TGenerics extends ChoicekitPluginInputGenerics = ChoicekitPluginInputGenerics,
	TMode extends "input" | "output" = "output",
> = ("input" extends TMode
	? BaseChoicekitPlugin<TGenerics>
	: /** Since *purely* optional properties will be supplied defaults, they can be assumed to be always be non optional after `definePlugin` is called */
		Required<BaseChoicekitPlugin<TGenerics>>) &
	ConditionalApiPluginExtension<TGenerics> &
	ConditionalSerializedStatePluginExtension<TGenerics> &
	ConditionalStatePluginExtension<TGenerics>;

export interface ChoicekitPluginSaveStructure<
	TSerialized extends
		TransformableOrJsonSerializableType = TransformableOrJsonSerializableType,
> {
	version: ChoicekitSemanticVersionString;
	data: TSerialized;
}

const PLUGIN_DEFAULTS = {
	dependencies: [],
	id: "",
	onOverride: "err",
	version: "0.0.1",
} as const satisfies ChoicekitPlugin;

/** Small wrapper with a single object generic paramter for creating strongly-typed plugins.
 *
 * Applies defaults to missing properties.
 */
export function definePlugin<
	const TInputGenerics extends ChoicekitPluginInputGenerics,
>(
	plugin: ChoicekitPlugin<TInputGenerics, "input">,
): ChoicekitPlugin<TInputGenerics, "output"> {
	//@ts-expect-error Inference limitation
	return Object.assign(clone(PLUGIN_DEFAULTS), plugin);
}
