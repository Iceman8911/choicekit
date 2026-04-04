import type { ChoicekitPlugin } from "../plugins/plugin";
import type {
	ChoicekitEngineArguments,
	ChoicekitEngineGenerics,
	ChoicekitEngineVariableInitData,
} from "./_shared";
import { ChoicekitEngine } from "./if-engine";

type ChoicekitEngineArgumentKeys = keyof ChoicekitEngineArguments;

type BuilderMethods = Record<
	// For clarity sake
	"withPlugins" extends `with${Capitalize<ChoicekitEngineArgumentKeys>}`
		? "withPlugin"
		: `with${Capitalize<ChoicekitEngineArgumentKeys>}`,
	// biome-ignore lint/suspicious/noExplicitAny: <Generics>
	(...args: any) => ChoicekitEngineBuilder<any>
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
} as const satisfies { [K in ChoicekitEngineArgumentKeys]: K };

/** To enforce type safety and work around typescript limitations with advanced generics, a builder for the engine is more convenient.
 *
 * If you need a reset builder, simply instantiate a new instance.
 */
export class ChoicekitEngineBuilder<
	TGenerics extends ChoicekitEngineGenerics,
	TArgs extends ChoicekitEngineArguments = ChoicekitEngineArguments<TGenerics>,
> implements BuilderMethods
{
	#args: Partial<TArgs> = {};

	#forceAddProp(prop: ChoicekitEngineArgumentKeys, val: unknown) {
		//@ts-expect-error tired of figthing ts
		this.#args[prop] = val;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <Not worth explictly typing this>
	#returnThis(): any {
		return this;
	}

	/** Set the engine name.
	 *
	 * Multiple engines with the same name share the same save data.
	 */
	withName<const TName extends TGenerics["name"]>(
		name: TName,
	): ChoicekitEngineBuilder<TGenerics & { [sbName]: TName }> {
		this.#forceAddProp(sbName, name);

		return this.#returnThis();
	}

	/** Set an object containing the variables to be used in the story via the engine */
	withVars<TVars extends TGenerics["vars"]>(
		vars: TVars | ((init: ChoicekitEngineVariableInitData) => TVars),
	): ChoicekitEngineBuilder<TGenerics & { [sbVars]: TVars }> {
		this.#forceAddProp(sbVars, vars);

		return this.#returnThis();
	}

	/** Add the crucial initial set of pasasges, where the first element is the starting passage.
	 *
	 * If the tags / name / data type is too strict, just cast a string entry to the desired widened type using `as` like:
	 *
	 * @example
	 * ```ts
	 * const engine = await new ChoicekitEngineBuilder().withPassages({name: "Start Passage" as string, data: "Lorem Ipsum" as string, tags: ["Start" as string]})
	 * ```
	 */
	withPassages<const TPassage extends TGenerics["passages"]>(
		...passages: [TPassage, ...TPassage[]]
	): ChoicekitEngineBuilder<TGenerics & { [sbPassages]: TPassage }> {
		this.#forceAddProp(sbPassages, passages);

		return this.#returnThis();
	}

	/** Set an object containing the achievements to be used in the story via the engine.
	 *
	 * Unlike the story variables, this is persisted seperately from saved states.
	 */
	withAchievements<TAchievements extends TGenerics["achievements"]>(
		achievements: TAchievements,
	): ChoicekitEngineBuilder<TGenerics & { [sbAchievements]: TAchievements }> {
		this.#forceAddProp(sbAchievements, achievements);

		return this.#returnThis();
	}

	/** Set an object containing the settings to be used in the story via the engine.
	 *
	 * Unlike the story variables, this is persisted seperately from saved states.
	 */
	withSettings<TSettings extends TGenerics["settings"]>(
		settings: TSettings,
	): ChoicekitEngineBuilder<TGenerics & { [sbSettings]: TSettings }> {
		this.#forceAddProp(sbSettings, settings);

		return this.#returnThis();
	}

	/** A list of compatible class constructors to allow userland-classes to be cloned and persisted without issue */
	withClasses(...classes: TArgs["classes"]): ChoicekitEngineBuilder<TGenerics> {
		this.#forceAddProp(sbClasses, classes);

		return this.#returnThis();
	}

	/** Special Choicekit configuration */
	withConfig(config: TArgs["config"]): ChoicekitEngineBuilder<TGenerics> {
		this.#forceAddProp(sbConfig, config);

		return this.#returnThis();
	}

	/** Add save migrations for to update older saves */
	withMigrators(
		migrations: TArgs["migrations"],
	): ChoicekitEngineBuilder<TGenerics> {
		this.#forceAddProp(sbMigrations, migrations);

		return this.#returnThis();
	}

	/** Register a plugin with its configuration.
	 *
	 * Call this method multiple times to register multiple plugins.
	 * Each plugin's mutations will be properly typed and accumulated.
	 */
	withPlugin<const TPlugin extends ChoicekitPlugin>(
		plugin: TPlugin,
		config: TPlugin extends ChoicekitPlugin<infer RGenerics>
			? RGenerics["config"]
			: never,
	): ChoicekitEngineBuilder<
		TGenerics & { plugins: [...TGenerics["plugins"], TPlugin] }
	> {
		const pluginsAndConfigs: TArgs["plugins"] = this.#args.plugins ?? [];

		pluginsAndConfigs.push({ config, plugin });

		this.#forceAddProp(sbPlugins, pluginsAndConfigs);

		return this.#returnThis();
	}

	/** Use the given configuration to create a new typesafe engine for use */
	async build(): Promise<ChoicekitEngine<TGenerics>> {
		const engine = await ChoicekitEngine.init(this.#args);

		return engine;
	}
}
// todo, make ts infer a method as `never` if it's been called.
