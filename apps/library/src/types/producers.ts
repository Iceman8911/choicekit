import type { TransformableOrJsonSerializableType } from "@packages/serializer";
import type { ReadonlyDeep } from "type-fest";

/** Generic type helper for creating producers */
export type Producer<TData> = (state: TData) => void | TData | Promise<TData>;

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
	/** For updating the outer scope reference of the pssed in value */
	updater: (updatedVal: TData) => void;
	/** Event-related config */
	event?:
		| {
				/** Emit the event after the producer is ran */
				emit: true;
				/** Name of the event */
				name: TEventName;
				/** Event dispatcher and listener */
				target: EventTarget;
		  }
		| {
				/** Do not emit the event (default) */
				emit?: false;
		  };
	/** Extra stuff to run after the producer has been called  */
	onEnd?: (
		oldData: ReadonlyDeep<TData>,
		newData: ReadonlyDeep<TData>,
	) => Promise<void>;
}) => Promise<void>;
