import type { ChoicekitEngine } from "../../engine/if-engine";
import {
	type ChoicekitPlugin,
	definePlugin,
	type ValidatePluginGenerics,
} from "../plugin";

/**
 * Result returned by a single storylet condition callback.
 *
 * - `boolean`: pass/fail with default weight `1` when passing.
 * - `[boolean, number]`: pass/fail with explicit weight used for tie-breaking.
 */
type StoryletConditionResult = boolean | readonly [boolean, number];

/** Condition callback evaluated against the current engine instance. */
export type StoryletCondition<
	TEngine extends ChoicekitEngine = ChoicekitEngine,
> = (engine: TEngine) => StoryletConditionResult;

/** One storylet definition consumed by the official storylet plugin. */
export type StoryletConfigEntry<
	TPassageId extends string = string,
	TEngine extends ChoicekitEngine = ChoicekitEngine,
> = Readonly<{
	/** Stable display and stats key for the storylet entry. */
	name: string;
	/** Passage to navigate to when this storylet is selected/loaded. */
	passageId: TPassageId;
	/** Optional global priority (default `0`) used after ratio/weight tie-breakers. */
	priority?: number;
	/**
	 * Condition callbacks for this entry.
	 *
	 * All conditions must pass for the storylet to be considered eligible.
	 */
	conditions: ReadonlyArray<StoryletCondition<TEngine>>;
}>;

/** Computed scorecard for a storylet after evaluating all configured conditions. */
export type StoryletEvaluation<TPassageId extends string = string> = Readonly<{
	name: string;
	passageId: TPassageId;

	/** Normalized storylet-level priority value (defaults to `0`). */
	priority: number;
	/** `true` only when all configured conditions pass. */
	isEligible: boolean;
	/** Number of passing condition callbacks. */
	passingConditions: number;
	/** Number of failing condition callbacks. */
	failingConditions: number;
	/** Ratio in range `[0, 1]`, where `1` means fully passing. */
	completionRatio: number;
	/** Sum of passing condition weights used as a tie-breaker. */
	conditionPriorityScore: number;
}>;

/** Internal mutable plugin state. */
type StoryletPluginState = {
	/** Times each storylet has been selected through plugin APIs. */
	selectedCounts: Record<string, number>;
	/** Times each selected storylet was actually loaded as the active passage. */
	loadedCounts: Record<string, number>;
	/**
	 * Pending selection intents waiting for a matching `passageChange` event.
	 *
	 * This is used to separate "selected" from "loaded" counters.
	 */
	pendingLoads: Array<{
		storyletName: string;
		passageId: string;
	}>;
};

type StoryletPluginGenerics<
	TConditionEngine extends ChoicekitEngine,
	TPassageId extends string,
> = ValidatePluginGenerics<{
	id: "storylet";
	engine: TConditionEngine;
	config: {
		storylets: ReadonlyArray<StoryletConfigEntry<TPassageId, TConditionEngine>>;
	};
	state: StoryletPluginState;
	serializedState: {
		selectedCounts: Record<string, number>;
		loadedCounts: Record<string, number>;
	};
	api: {
		getEligibleStorylets: () => Array<StoryletEvaluation<TPassageId>>;
		getTopEligibleStorylet: () => StoryletEvaluation<TPassageId> | null;
		markStoryletSelected: (storyletName: string) => void;
		loadTopEligibleStorylet: () => StoryletEvaluation<TPassageId> | null;
		getStoryletStats: (
			storyletName: string,
		) => Readonly<{ selected: number; loaded: number }>;
	};
	dependencies: [];
}>;

/** Convert unknown priority-like values to a stable finite number. */
function normalizePriority(value: unknown): number {
	if (typeof value !== "number" || Number.isFinite(value) === false) {
		return 0;
	}

	return value;
}

/** Normalize condition callback outputs into a common shape for scoring. */
function normalizeConditionResult(result: StoryletConditionResult): {
	passed: boolean;
	weight: number;
} {
	if (Array.isArray(result)) {
		const [passed, rawWeight] = result as [boolean, number];
		const weight = normalizePriority(rawWeight);

		return {
			passed,
			weight,
		};
	}

	return {
		passed: result as boolean,
		weight: 1,
	};
}

/**
 * Create the official storylet plugin.
 *
 * The resulting API is mounted at `engine.$.storylet` and provides:
 * - query APIs for eligible/top storylets
 * - explicit selection/loading helpers
 * - per-storylet selection/load statistics
 *
 * Persistence uses `serialize.withSave = true`, so counters rewind with story saves.
 */
export function createStoryletPlugin<
	TConditionEngine extends ChoicekitEngine = ChoicekitEngine,
	TPassageId extends string = TConditionEngine["passageId"],
>(): ChoicekitPlugin<StoryletPluginGenerics<TConditionEngine, TPassageId>> {
	return definePlugin({
		id: "storylet",
		initApi({ config, engine, state }) {
			/** Resolve and validate a storylet name from config. */
			const getStoryletByName = (storyletName: string) => {
				const storylet = config.storylets.find(
					(entry) => entry.name === storyletName,
				);

				if (!storylet) {
					throw Error(`Unknown storylet '${storyletName}'`);
				}

				return storylet;
			};

			/** Evaluate and rank all configured storylets for the current engine state. */
			const evaluateAllStorylets = () => {
				const evaluations = config.storylets.map<
					StoryletEvaluation<TPassageId>
				>((storylet) => {
					if (!storylet.conditions.length) {
						throw Error(
							`Storylet '${storylet.name}' has no conditions. Add at least one condition callback.`,
						);
					}

					let passingConditions = 0;
					let failingConditions = 0;
					let passingWeight = 0;

					for (const condition of storylet.conditions) {
						const { passed, weight } = normalizeConditionResult(
							condition(engine as unknown as TConditionEngine),
						);

						if (passed) {
							passingConditions += 1;
							passingWeight += weight;
						} else {
							failingConditions += 1;
						}
					}

					return {
						completionRatio: passingConditions / storylet.conditions.length,
						conditionPriorityScore: passingWeight || passingConditions,
						failingConditions,
						isEligible: failingConditions === 0,
						name: storylet.name,
						passageId: storylet.passageId,
						passingConditions,
						priority: normalizePriority(storylet.priority),
					};
				});

				return evaluations.sort((a, b) => {
					// Primary ranking: fully passing entries should always outrank partial matches.
					if (a.completionRatio !== b.completionRatio) {
						return b.completionRatio - a.completionRatio;
					}

					if (a.conditionPriorityScore !== b.conditionPriorityScore) {
						return b.conditionPriorityScore - a.conditionPriorityScore;
					}

					if (a.priority !== b.priority) {
						return b.priority - a.priority;
					}

					if (a.passingConditions !== b.passingConditions) {
						return b.passingConditions - a.passingConditions;
					}

					return a.name.localeCompare(b.name);
				});
			};

			/** Return the single highest-ranked eligible storylet, or null if none pass. */
			const getTopEligibleStorylet = () => {
				return (
					evaluateAllStorylets().find((storylet) => storylet.isEligible) ?? null
				);
			};

			/** Increment selection stats and register a pending load expectation. */
			const markStoryletSelected = (storyletName: string) => {
				const storylet = getStoryletByName(storyletName);

				state.selectedCounts[storyletName] =
					(state.selectedCounts[storyletName] ?? 0) + 1;
				state.pendingLoads.push({
					passageId: storylet.passageId,
					storyletName,
				});
			};

			// Convert pending selection intents into "loaded" stats once the passage actually changes.
			engine.on("passageChange", () => {
				const currentPassageId = engine.passageId;
				const pendingIndex = state.pendingLoads.findIndex(
					(entry) => entry.passageId === currentPassageId,
				);

				if (pendingIndex < 0) {
					return;
				}

				const pending = state.pendingLoads[pendingIndex];
				if (!pending) {
					return;
				}

				const { storyletName } = pending;

				state.pendingLoads.splice(pendingIndex, 1);
				state.loadedCounts[storyletName] =
					(state.loadedCounts[storyletName] ?? 0) + 1;
			});

			return {
				/** Return only fully-eligible storylets, sorted by ranking. */
				getEligibleStorylets() {
					return evaluateAllStorylets().filter(
						(storylet) => storylet.isEligible,
					);
				},
				/** Return selection/load counters for one named storylet. */
				getStoryletStats(storyletName) {
					return {
						loaded: state.loadedCounts[storyletName] ?? 0,
						selected: state.selectedCounts[storyletName] ?? 0,
					};
				},
				/** Return the single highest-ranked eligible storylet for current state. */
				getTopEligibleStorylet,
				/**
				 * Convenience helper: select and immediately navigate to the current top storylet.
				 *
				 * Returns `null` when no storylet is currently eligible.
				 */
				loadTopEligibleStorylet() {
					const topStorylet = getTopEligibleStorylet();

					if (!topStorylet) {
						return null;
					}

					markStoryletSelected(topStorylet.name);
					engine.navigateTo(topStorylet.passageId);

					return topStorylet;
				},
				/** Mark one storylet as selected without navigating. */
				markStoryletSelected,
			};
		},
		/** Initialize fresh per-engine counters. */
		initState() {
			return {
				loadedCounts: {},
				pendingLoads: [],
				selectedCounts: {},
			};
		},
		/** Restore persisted counters; pending loads are intentionally reset. */
		onDeserialize({ data, state }) {
			state.selectedCounts = data.selectedCounts ?? {};
			state.loadedCounts = data.loadedCounts ?? {};
			state.pendingLoads = [];
		},
		serialize: {
			/** Persist only stable counters with story save data. */
			method(state) {
				return {
					loadedCounts: state.loadedCounts,
					selectedCounts: state.selectedCounts,
				};
			},
			/** Rewind with story saves so stats remain run-specific. */
			withSave: true,
		},
	});
}

export default createStoryletPlugin;
