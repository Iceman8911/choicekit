import type { SugarboxEngine } from "../engine/if-engine";
import type { GenericObject } from "./shared";

type SugarboxPluginDependencies<
	TDeps extends ReadonlyArray<
		readonly [SugarboxPlugin<any>, any]
	> = ReadonlyArray<readonly [SugarboxPlugin<any>, any]>,
> = {
	readonly [K in keyof TDeps]: TDeps[K] extends readonly [infer Plugin, any]
		? Plugin extends SugarboxPlugin<infer PG>
			? readonly [Plugin, PG["config"]]
			: TDeps[K]
		: TDeps[K];
};

interface SugarboxPluginGenerics {
	readonly namespace: string;
	readonly config: GenericObject;
	readonly engine?: SugarboxEngine;
	/** All the props the plugin will add / affect in the given namespace */
	readonly mutations: GenericObject;
	readonly overrideBehaviour: SugarboxPluginBehaviourOnOverride;
	readonly dependencies: ReadonlyArray<readonly [SugarboxPlugin<any>, any]>;
}

type SugarboxPluginBehaviourOnOverride = "err" | "ignore" | "override";

type MaybePromise<T> = Promise<T> | T;

export interface SugarboxPlugin<
	TGenerics extends SugarboxPluginGenerics = SugarboxPluginGenerics,
> {
	/** Namespace on the engine instance where all methods and functionality are mounted.
	 *
	 * All namespaces are within an object `$`, e.g `engine.$.storylet`
	 *
	 * If multiple plugins have the same namespace, plugin instantiation throws.
	 */
	readonly name: TGenerics["namespace"];

	/** How the engine should react when another plugin directly / indeirectly attempts to register itself on the same namespace.
	 *
	 * `err` - Keep original plugin, throw an error
	 *
	 * `ignore` - Keep original plugin, no error is thrown, but it is logged
	 *
	 * `override` - Override original plugin, no error is thrown, but it is logged
	 */
	readonly onOverride: TGenerics["overrideBehaviour"];

	/** Other plugins and their configs that must be loaded before hand. */
	readonly dependencies?: TGenerics["dependencies"];

	/** Plugin functionality for mutating the engine. Uses the engine and given config, and returns an object containing the plugin functionality that the engine will attach to itself */
	readonly init: (
		engine: TGenerics["engine"] extends SugarboxEngine<infer EngineGenerics>
			? SugarboxEngine<
					EngineGenerics & {
						plugins: EngineGenerics["plugins"] & {
							[K in TGenerics["dependencies"][number] as K extends readonly [
								infer Plugin,
								any,
							]
								? Plugin extends SugarboxPlugin<infer PG>
									? PG["namespace"]
									: never
								: never]: K extends readonly [infer Plugin, any]
								? Plugin extends SugarboxPlugin<infer PG>
									? PG["mutations"]
									: never
								: never;
						};
					}
				>
			: never,
		config: TGenerics["config"],
	) => MaybePromise<TGenerics["mutations"]>;
}

/** Helper function to define a plugin with proper type inference */
export function definePlugin<
	const TNamespace extends SugarboxPluginGenerics["namespace"],
	const TConfig extends SugarboxPluginGenerics["config"],
	const TMutations extends SugarboxPluginGenerics["mutations"],
	const TOverrideBehaviour extends SugarboxPluginGenerics["overrideBehaviour"],
	const TDependencies extends ReadonlyArray<
		readonly [SugarboxPlugin<any>, any]
	> = ReadonlyArray<readonly [SugarboxPlugin<any>, any]>,
	const TEngine extends SugarboxEngine = SugarboxEngine,
>(plugin: {
	readonly name: TNamespace;
	readonly onOverride: TOverrideBehaviour;
	readonly init: (
		engine: TEngine extends SugarboxEngine<infer EngineGenerics>
			? SugarboxEngine<
					EngineGenerics & {
						plugins: EngineGenerics["plugins"] & {
							[K in TDependencies[number] as K extends readonly [
								infer Plugin,
								any,
							]
								? Plugin extends SugarboxPlugin<infer PG>
									? PG["namespace"]
									: never
								: never]: K extends readonly [infer Plugin, any]
								? Plugin extends SugarboxPlugin<infer PG>
									? PG["mutations"]
									: never
								: never;
						};
					}
				>
			: never,
		config: TConfig,
	) => MaybePromise<TMutations>;
	readonly dependencies?: SugarboxPluginDependencies<TDependencies>;
}): SugarboxPlugin<{
	readonly namespace: TNamespace;
	readonly config: TConfig;
	readonly engine: TEngine;
	readonly mutations: TMutations;
	readonly overrideBehaviour: TOverrideBehaviour;
	readonly dependencies: SugarboxPluginDependencies<TDependencies>;
}> {
	return plugin as any;
}
