import { TypedEventEmitter } from "@packages/event-emitter";
import { clone } from "@packages/serializer";
import type { ReadonlyDeep } from "type-fest";
import type { Producer } from "../../_internal/models/producers";
import type {
	ExpandType,
	GenericSerializableObject,
} from "../../_internal/models/shared";
import { createStateSetter } from "../../_internal/utils/producers";
import {
	type ChoicekitPlugin,
	definePlugin,
	type ValidatePluginGenerics,
} from "../plugin";

interface AchievementEvents<TData extends GenericSerializableObject> {
	change: {
		new: TData;
		old: TData;
	};
}

type AchievementsPluginGenerics<TData extends GenericSerializableObject> =
	ValidatePluginGenerics<{
		api: {
			/** Returns a readonly copy of the achievements */
			get: () => ReadonlyDeep<TData>;

			/** An immer-style producer for flexibly updating achievement state.
			 *
			 * If the producer throws, changes will be rolled back and the error rethrown for consumers to react to.
			 *
			 * Changes are persisted asynchronously without waiting, use `save()` if you need to wait for the save to complete
			 */
			set: (producer: Producer<TData>, emitEvent?: boolean) => void;

			/** Forces a save of the current achievements state */
			save(): Promise<void>;
			on: TypedEventEmitter<AchievementEvents<TData>>["on"];
			once: TypedEventEmitter<AchievementEvents<TData>>["once"];
			off: TypedEventEmitter<AchievementEvents<TData>>["off"];
		};
		id: "achievements";
		serializedState: {
			achievements: TData;
		};
		state: {
			achievements: TData;
			eventEmitter: TypedEventEmitter<AchievementEvents<TData>>;
		};
		config: {
			/** The starting state for the achievements */
			default: TData;
		};
		dependencies: [];
	}>;

export function createAchievementsPlugin<
	TData extends GenericSerializableObject,
>(data: TData): ChoicekitPlugin<AchievementsPluginGenerics<ExpandType<TData>>> {
	return definePlugin({
		id: "achievements",
		initApi({ config, state, triggerSave }) {
			const { default: initialState } = config;

			// Use the actual input from the config
			state.achievements = initialState;

			// Set up the state setter
			const stateSetter = createStateSetter<
				"achievements",
				ExpandType<TData>,
				"change"
			>(state, "achievements");

			return {
				get() {
					return state.achievements as ReadonlyDeep<ExpandType<TData>>;
				},
				off(eventName, listener) {
					return state.eventEmitter.off(eventName, listener);
				},
				on(eventName, listener) {
					return state.eventEmitter.on(eventName, listener);
				},
				once(eventName, listener) {
					return state.eventEmitter.once(eventName, listener);
				},
				save: triggerSave,
				set(producer, emitEvent = true) {
					stateSetter({
						event: {
							emit: emitEvent,
							emitter: state.eventEmitter,
							name: "change",
						},
						producer,
					});

					triggerSave(); // Trigger a save after the state has been updated, but don't wait for it to complete
				},
			};
		},
		initState() {
			return {
				// Dummy state
				achievements: clone(data as ExpandType<TData>),
				eventEmitter: new TypedEventEmitter<
					AchievementEvents<ExpandType<TData>>
				>(),
			};
		},
		onDeserialize({ data: { achievements }, state }) {
			state.achievements = achievements;
		},
		serialize: {
			method({ achievements }) {
				return { achievements };
			},
			withSave: false,
		},
	});
}

export default createAchievementsPlugin;
