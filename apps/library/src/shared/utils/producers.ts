import { clone } from "@packages/serializer";
import type { StateSetter } from "../../types/producers";
import type { GenericSerializableObject } from "../../types/shared";
import { makeReadonly } from "./type-cast";

export function createStateSetter<
	TPropName extends string,
	TData extends GenericSerializableObject,
	TEventName extends string,
>(
	objectWithPropToMutate: { [K in TPropName]: TData },
	propName: TPropName,
): StateSetter<TData, TEventName> {
	let internalStateToUpdate: TData = objectWithPropToMutate[propName];

	return ({ producer, event }) => {
		const oldInternalState = clone(internalStateToUpdate);

		try {
			/** Run the producer on the internal state. If a non-void result is returned, use that to additionally overwrite the state */
			const producerResult = producer(internalStateToUpdate);

			if (producerResult !== undefined) {
				internalStateToUpdate = producerResult;
			}

			objectWithPropToMutate[propName] = internalStateToUpdate;
		} catch (e) {
			// Rollback changes and rethrow
			objectWithPropToMutate[propName] = oldInternalState;

			throw e;
		}

		const clonedNewState = clone(internalStateToUpdate);

		if (event?.emit) {
			event.emitter.emit(event.name, {
				new: clonedNewState,
				old: oldInternalState,
			});
		}

		return [makeReadonly(oldInternalState), makeReadonly(clonedNewState)];
	};
}
