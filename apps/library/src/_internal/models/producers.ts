import type { TypedEventEmitter } from "@packages/event-emitter";
import type { TransformableOrJsonSerializableType } from "@packages/serializer";
import type { ReadonlyDeep } from "type-fest";

/** Generic type helper for creating producers */
// biome-ignore lint/suspicious/noConfusingVoidType: <I don't want to force a return>
export type Producer<TData> = (state: TData) => void | TData;

/** Generic type helper for creating state setters which take in a producer, run it, and store the state changes, alongside optionally emitting an event.
 *
 * If the producer fails, changes rollback and the error is rethrown for consumers to react to.
 */
export type StateSetter<
	TData extends TransformableOrJsonSerializableType,
	TEventName extends string,
> = (arg: {
	/** Producer to update the data */
	producer: Producer<TData>;
	/** Event-related config */
	event?:
		| {
				/** Emit the event after the producer is ran */
				emit: true;
				/** Name of the event */
				name: TEventName;
				/** Event dispatcher and listener */
				emitter: TypedEventEmitter<{
					[K in TEventName]: { new: TData; old: TData };
				}>;
		  }
		| {
				/** Do not emit the event (default) */
				emit?: false;
		  };
}) => [oldData: ReadonlyDeep<TData>, newData: ReadonlyDeep<TData>];
