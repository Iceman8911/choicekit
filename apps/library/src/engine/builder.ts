import type {
	SugarBoxEngineArguments,
	SugarBoxEngineGenerics,
	SugarBoxEngineVariableInitData,
} from "./_shared";
import { SugarboxEngine } from "./if-engine";

type DeepWiden<T> = T extends string
	? string
	: T extends number
		? number
		: T extends bigint
			? bigint
			: T extends boolean
				? boolean
				: T extends symbol
					? symbol
					: T extends Function
						? T
						: T extends Array<infer U>
							? Array<DeepWiden<U>>
							: T extends object
								? { [K in keyof T]: DeepWiden<T[K]> }
								: T extends Set<infer U>
									? Set<DeepWiden<U>>
									: T extends Map<infer K, infer V>
										? Map<DeepWiden<K>, DeepWiden<V>>
										: T;

type SugarBoxEngineArgumentKeys = keyof SugarBoxEngineArguments;

type BuilderMethods = Record<
	`with${Capitalize<SugarBoxEngineArgumentKeys>}`,
	(...args: any) => SugarboxEngineBuilder<SugarBoxEngineGenerics>
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
} = {
	achievements: "achievements",
	classes: "classes",
	config: "config",
	migrations: "migrations",
	name: "name",
	passages: "passages",
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
	withVars<const TVars extends TGenerics["vars"]>(
		vars: TVars | ((init: SugarBoxEngineVariableInitData) => TVars),
	): SugarboxEngineBuilder<TGenerics & { [sbVars]: DeepWiden<TVars> }> {
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
	withAchievements<const TAchievements extends TGenerics["achievements"]>(
		achievements: TAchievements,
	): SugarboxEngineBuilder<
		TGenerics & { [sbAchievements]: DeepWiden<TAchievements> }
	> {
		this.#forceAddProp(sbAchievements, achievements);

		return this.#returnThis();
	}

	/** Set an object containing the settings to be used in the story via the engine.
	 *
	 * Unlike the story variables, this is persisted seperately from saved states.
	 */
	withSettings<const TSettings extends TGenerics["settings"]>(
		settings: TSettings,
	): SugarboxEngineBuilder<TGenerics & { [sbSettings]: DeepWiden<TSettings> }> {
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

	/** Use the given configuration to create a new typesafe engine for use */
	async build(): Promise<SugarboxEngine<TGenerics>> {
		//@ts-expect-error Yeah, yeah, `#args` as a partial works here unless I do something stupid in `init` but that's what tests are for :D
		return SugarboxEngine.init(this.#args);
	}
}
