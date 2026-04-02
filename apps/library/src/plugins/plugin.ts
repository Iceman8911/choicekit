import {
	clone,
	type TransformableOrJsonSerializableType,
} from "@packages/serializer";
import type { Promisable } from "type-fest";
import type {
	GenericObject,
	GenericSerializableObject,
} from "../_internal/models/shared";
import type { SugarBoxSemanticVersionString } from "../_internal/utils/version";
import type { SugarboxEngine } from "../engine/core/if-engine";

type SugarboxPluginBehaviourOnOverride = "err" | "ignore" | "override";

type SugarboxPlugins = ReadonlyArray<SugarboxPlugin>;

type MapPluginsToPluginAndConfigTuple<TPlugins extends SugarboxPlugins> = {
	[K in keyof TPlugins]: TPlugins[K] extends SugarboxPlugin
		? {
				readonly plugin: TPlugins[K];
				readonly config: InferConfigFromPlugin<TPlugins[K]>;
			}
		: TPlugins[K];
};

export interface SugarboxPluginInputGenerics {
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
	readonly engine?: SugarboxEngine;

	/** All the public props and functionality the plugin will attach the given namespace on the engine */
	readonly api?: GenericObject;

	/** How the engine will resolve "conflicts" when multiple plugins try to mount onto the same namespace
	 *
	 * @default "err"
	 */
	readonly overrideBehaviour?: SugarboxPluginBehaviourOnOverride;

	/** Optional external plugins this plugin needs to be mounted beforehand. */
	readonly dependencies?: SugarboxPlugins;

	/** Optional data shape if you need to persist some plugin state. */
	readonly serializedState?: GenericSerializableObject;
}

/** Typed helper for creating your plugin's generics with autocomplete on any competent IDE */
export type ValidatePluginGenerics<
	TGenerics extends SugarboxPluginInputGenerics,
> = TGenerics;

type InferConfigFromPlugin<TPlugin extends SugarboxPlugin> =
	TPlugin extends SugarboxPlugin<infer RGenerics>
		? RGenerics["config"]
		: SugarboxPluginInputGenerics["config"];

type NormalizeState<TState extends GenericObject | undefined> =
	undefined extends TState
		? GenericObject
		: TState extends undefined
			? GenericObject
			: TState;
type NormalizeEngine<TEngine extends SugarboxEngine | undefined> =
	undefined extends TEngine
		? SugarboxEngine
		: TEngine extends undefined
			? SugarboxEngine
			: TEngine;
type NormalizeApi<TApi extends GenericObject | undefined> =
	undefined extends TApi
		? GenericObject
		: TApi extends undefined
			? GenericObject
			: TApi;
type NormalizeOverrideBehaviour<
	TOverride extends SugarboxPluginBehaviourOnOverride | undefined,
> = undefined extends TOverride
	? SugarboxPluginBehaviourOnOverride
	: TOverride extends undefined
		? SugarboxPluginBehaviourOnOverride
		: TOverride;
type NormalizeDependencies<TDeps extends SugarboxPlugins | undefined> =
	undefined extends TDeps
		? SugarboxPlugins
		: TDeps extends undefined
			? SugarboxPlugins
			: TDeps;
type NormalizeSerializedState<
	TSerialized extends TransformableOrJsonSerializableType | undefined,
> = undefined extends TSerialized
	? any
	: TSerialized extends undefined
		? any
		: TSerialized;

type AddDependenciesToEngine<
	TEngine extends SugarboxEngine,
	TDeps extends SugarboxPlugins,
> =
	TEngine extends SugarboxEngine<infer REngineGenerics>
		? SugarboxEngine<
				REngineGenerics & {
					plugins: [...REngineGenerics["plugins"], ...TDeps];
				}
			>
		: SugarboxEngine;

interface SugarboxPluginSerializeConfig<
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

interface BaseSugarboxPlugin<TGenerics extends SugarboxPluginInputGenerics> {
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
	version?: SugarBoxSemanticVersionString;
}

type OptionalizeIfUndefined<TValue, TShape> = undefined extends TValue
	? Partial<TShape>
	: TShape;

type ConditionalStatePluginExtension<
	TGenerics extends SugarboxPluginInputGenerics,
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
	TGenerics extends SugarboxPluginInputGenerics,
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
				/** Sugarbox Engine for you to do all you need */
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
	TGenerics extends SugarboxPluginInputGenerics,
> = OptionalizeIfUndefined<
	TGenerics["serializedState"],
	{
		/** If you need persistent state, implement this property. */
		readonly serialize: SugarboxPluginSerializeConfig<
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
				version?: SugarBoxSemanticVersionString;
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

export type SugarboxPlugin<
	TGenerics extends SugarboxPluginInputGenerics = SugarboxPluginInputGenerics,
	TMode extends "input" | "output" = "output",
> = ("input" extends TMode
	? BaseSugarboxPlugin<TGenerics>
	: /** Since *purely* optional properties will be supplied defaults, they can be assumed to be always be non optional after `definePlugin` is called */
		Required<BaseSugarboxPlugin<TGenerics>>) &
	ConditionalApiPluginExtension<TGenerics> &
	ConditionalSerializedStatePluginExtension<TGenerics> &
	ConditionalStatePluginExtension<TGenerics>;

export interface SugarboxPluginSaveStructure<
	TSerialized extends
		TransformableOrJsonSerializableType = TransformableOrJsonSerializableType,
> {
	version: SugarBoxSemanticVersionString;
	data: TSerialized;
}

const PLUGIN_DEFAULTS = {
	dependencies: [],
	id: "",
	onOverride: "err",
	version: "0.0.1",
} as const satisfies SugarboxPlugin;

/** Small wrapper with a single object generic paramter for creating strongly-typed plugins.
 *
 * Applies defaults to missing properties.
 */
export function definePlugin<
	const TInputGenerics extends SugarboxPluginInputGenerics,
>(
	plugin: SugarboxPlugin<TInputGenerics, "input">,
): SugarboxPlugin<TInputGenerics, "output"> {
	//@ts-expect-error Inference limitation
	return Object.assign(clone(PLUGIN_DEFAULTS), plugin);
}
