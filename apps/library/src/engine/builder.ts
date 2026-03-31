import type { SugarboxPlugin } from "../plugins/plugin";
import type {
	SugarBoxEngineArguments,
	SugarBoxEngineGenerics,
	SugarBoxEngineVariableInitData,
} from "./_shared";
import { SugarboxEngine } from "./if-engine";

type SugarBoxEngineArgumentKeys = keyof SugarBoxEngineArguments;

type BuilderMethods = Record<
	// For clarity sake
	"withPlugins" extends `with${Capitalize<SugarBoxEngineArgumentKeys>}`
		? "withPlugin"
		: `with${Capitalize<SugarBoxEngineArgumentKeys>}`,
	(...args: any) => SugarboxEngineBuilder<any>
>;

const {
	achievements: sbAchievements,
	classes: sbClasses,
	config: sbConfig,
	migrations: sbMigrations,
	name: sbName,
	passages: sbPassages,
	settings: sbSettings,
	vars: sbVars,
	plugins: sbPlugins,
} = {
	achievements: "achievements",
	classes: "classes",
	config: "config",
	migrations: "migrations",
	name: "name",
	passages: "passages",
	plugins: "plugins",
	settings: "settings",
	vars: "vars",
} as const satisfies { [K in SugarBoxEngineArgumentKeys]: K };

/** To enforce type saftey and work around typescript limitations with advanced generics, a builder for the engine is more convenient.
 *
 * If you need a reset builder, simply instantiate a new instance.
 */
export class SugarboxEngineBuilder<
	TGenerics extends SugarBoxEngineGenerics,
	TArgs extends SugarBoxEngineArguments = SugarBoxEngineArguments<TGenerics>,
> implements BuilderMethods
{
	#args: Partial<TArgs> = {};

	#forceAddProp(prop: SugarBoxEngineArgumentKeys, val: unknown) {
		//@ts-expect-error tired of figthing ts
		this.#args[prop] = val;
	}

	#returnThis(): any {
		return this;
	}

	/** Set the engine name.
	 *
	 * Multiple engines with the same name share the same save data.
	 */
	withName<const TName extends TGenerics["name"]>(
		name: TName,
	): SugarboxEngineBuilder<TGenerics & { [sbName]: TName }> {
		this.#forceAddProp(sbName, name);

		return this.#returnThis();
	}

	/** Set an object containing the variables to be used in the story via the engine */
	withVars<TVars extends TGenerics["vars"]>(
		vars: TVars | ((init: SugarBoxEngineVariableInitData) => TVars),
	): SugarboxEngineBuilder<TGenerics & { [sbVars]: TVars }> {
		this.#forceAddProp(sbVars, vars);

		return this.#returnThis();
	}

	/** Add the crucial initial set of pasasges, where the first element is the starting passage.
	 *
	 * If the tags / name / data type is too strict, just cast a string entry to the desired widened type using `as` like:
	 *
	 * @example
	 * ```ts
	 * const engine = await new SugarboxEngineBuilder().withPassages({name: "Start Passage" as string, data: "Lorem Ipsum" as string, tags: ["Start" as string]})
	 * ```
	 */
	withPassages<const TPassage extends TGenerics["passages"]>(
		...passages: [TPassage, ...TPassage[]]
	): SugarboxEngineBuilder<TGenerics & { [sbPassages]: TPassage }> {
		this.#forceAddProp(sbPassages, passages);

		return this.#returnThis();
	}

	/** Set an object containing the achievements to be used in the story via the engine.
	 *
	 * Unlike the story variables, this is persisted seperately from saved states.
	 */
	withAchievements<TAchievements extends TGenerics["achievements"]>(
		achievements: TAchievements,
	): SugarboxEngineBuilder<TGenerics & { [sbAchievements]: TAchievements }> {
		this.#forceAddProp(sbAchievements, achievements);

		return this.#returnThis();
	}

	/** Set an object containing the settings to be used in the story via the engine.
	 *
	 * Unlike the story variables, this is persisted seperately from saved states.
	 */
	withSettings<TSettings extends TGenerics["settings"]>(
		settings: TSettings,
	): SugarboxEngineBuilder<TGenerics & { [sbSettings]: TSettings }> {
		this.#forceAddProp(sbSettings, settings);

		return this.#returnThis();
	}

	/** A list of compatible class constructors to allow userland-classes to be cloned and persisted without issue */
	withClasses(...classes: TArgs["classes"]): SugarboxEngineBuilder<TGenerics> {
		this.#forceAddProp(sbClasses, classes);

		return this.#returnThis();
	}

	/** Special sugarbox configuration */
	withConfig(config: TArgs["config"]): SugarboxEngineBuilder<TGenerics> {
		this.#forceAddProp(sbConfig, config);

		return this.#returnThis();
	}

	/** Add save migrations for to update older saves */
	withMigrations(
		migrations: TArgs["migrations"],
	): SugarboxEngineBuilder<TGenerics> {
		this.#forceAddProp(sbMigrations, migrations);

		return this.#returnThis();
	}

	/** Register a plugin with its configuration.
	 *
	 * Call this method multiple times to register multiple plugins.
	 * Each plugin's mutations will be properly typed and accumulated.
	 */
	withPlugin<const TPlugin extends SugarboxPlugin>(
		plugin: TPlugin,
		config: TPlugin extends SugarboxPlugin<infer RGenerics>
			? RGenerics["config"]
			: never,
	): SugarboxEngineBuilder<
		TGenerics & { plugins: [...TGenerics["plugins"], TPlugin] }
	> {
		const pluginsAndConfigs: TArgs["plugins"] = this.#args.plugins ?? [];

		pluginsAndConfigs.push({ config, plugin });

		this.#forceAddProp(sbPlugins, pluginsAndConfigs);

		return this.#returnThis();
	}

	/** Use the given configuration to create a new typesafe engine for use */
	async build(): Promise<SugarboxEngine<TGenerics>> {
		const engine = await SugarboxEngine.init(this.#args);

		return engine;
	}
}
// todo, make ts infer a method as `never` if it's been called.
