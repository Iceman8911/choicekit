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

interface SettingsEvents<TData extends GenericSerializableObject> {
	change: {
		new: TData;
		old: TData;
	};
}

type SettingsPluginGenerics<TData extends GenericSerializableObject> =
	ValidatePluginGenerics<{
		api: {
			/** Returns a readonly copy of the settings */
			get: () => ReadonlyDeep<TData>;

			/** An immer-style producer for flexibly updating settings state.
			 *
			 * If the producer throws, changes will be rolled back and the error rethrown for consumers to react to.
			 *
			 * Changes are persisted asynchronously without waiting, use `save()` if you need to wait for the save to complete
			 */
			set: (producer: Producer<TData>, emitEvent?: boolean) => void;

			/** Forces a save of the current settings state */
			save(): Promise<void>;
			on: TypedEventEmitter<SettingsEvents<TData>>["on"];
			once: TypedEventEmitter<SettingsEvents<TData>>["once"];
			off: TypedEventEmitter<SettingsEvents<TData>>["off"];
		};
		id: "settings";
		serializedState: {
			settings: TData;
		};
		state: {
			settings: TData;
			eventEmitter: TypedEventEmitter<SettingsEvents<TData>>;
		};
		config: {
			/** The starting state for the settings */
			default: TData;
		};
		dependencies: [];
	}>;

export function createSettingsPlugin<TData extends GenericSerializableObject>(
	data: TData,
): ChoicekitPlugin<SettingsPluginGenerics<ExpandType<TData>>> {
	return definePlugin({
		id: "settings",
		initApi({ config, state, triggerSave }) {
			const { default: initialState } = config;

			// Use the actual input from the config
			state.settings = initialState;

			// Set up the state setter
			const stateSetter = createStateSetter<
				"settings",
				ExpandType<TData>,
				"change"
			>(state, "settings");

			return {
				get() {
					return state.settings as ReadonlyDeep<ExpandType<TData>>;
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

					triggerSave();
				},
			};
		},
		initState() {
			return {
				eventEmitter: new TypedEventEmitter<
					SettingsEvents<ExpandType<TData>>
				>(),
				settings: clone(data as ExpandType<TData>),
			};
		},
		onDeserialize({ data: { settings }, state }) {
			state.settings = settings;
		},
		serialize: {
			method({ settings }) {
				return { settings };
			},
			withSave: false,
		},
	});
}

export default createSettingsPlugin;
