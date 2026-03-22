/** A reord of event names and their payloads */
type Listener<TArg> = (args: TArg) => void;

/** Type-safe way of listening to and emitting events */
export class TypedEventEmitter<const Events extends object> {
	#eventTarget = new EventTarget();
	/** So we can have an explicit `off` */
	#wrappers = new Map<string, WeakMap<Function, EventListener>>();

	on<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		const eventListener = ((customEvent: CustomEvent<Events[TEventName]>) =>
			listener(customEvent.detail)) as EventListener;

		const _name = String(eventName);

		let listenerMap = this.#wrappers.get(_name);

		if (!listenerMap) {
			listenerMap = new Map();
			this.#wrappers.set(_name, listenerMap);
		}

		listenerMap.set(listener, eventListener);

		this.#eventTarget.addEventListener(_name, eventListener);

		return () => this.off(eventName, listener);
	}

	off<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		const _name = String(eventName);

		const listenerMap = this.#wrappers.get(_name);

		const wrapper = listenerMap?.get(listener);

		if (!wrapper) return;

		this.#eventTarget.removeEventListener(_name, wrapper);

		listenerMap?.delete(listener);
	}

	emit<TEventName extends keyof Events>(
		eventName: TEventName,
		payload: Events[TEventName],
	) {
		const event = new CustomEvent<Events[TEventName]>(String(eventName), {
			detail: payload,
		});

		this.#eventTarget.dispatchEvent(event);
	}
}
