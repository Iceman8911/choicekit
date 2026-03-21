import { clone } from "@packages/serializer";
import type { StateSetter } from "../../types/producers";
import type { GenericSerializableObject } from "../../types/shared";
import { makeReadonly } from "./type-cast";

export function createStateSetter<
	TData extends GenericSerializableObject,
	TEventName extends string,
>(internalStateToUpdate: TData): StateSetter<TData, TEventName> {
	return async ({ producer, updater, event, onEnd }) => {
		const oldInternalState = clone(internalStateToUpdate);

		try {
			/** Run the producer on the internal state. If a non-void result is returned, use that to additionally overwrite the state */
			const producerResult = await producer(internalStateToUpdate);

			if (producerResult !== undefined) {
				// BUG: this breaks references and won't propagate changes to the source object :p
				internalStateToUpdate = producerResult;
			}

			updater(internalStateToUpdate);
		} catch (e) {
			// Rollback changes and rethrow
			updater(oldInternalState);

			throw e;
		}

		if (event?.emit) {
			event.target.dispatchEvent(
				new CustomEvent(event.name, {
					detail: { new: internalStateToUpdate, old: oldInternalState },
				}),
			);
		}

		await onEnd?.(
			makeReadonly(oldInternalState),
			makeReadonly(internalStateToUpdate),
		);
	};
}
