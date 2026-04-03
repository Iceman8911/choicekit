/** A reord of event names and their payloads */
type Listener<TArg> = (args: TArg) => void;

/** Type-safe way of listening to and emitting events */
export class TypedEventEmitter<const Events extends object> {
	#eventTarget = new EventTarget();
	/** So we can have an explicit `off` */
	#wrappers = new Map<string, Map<object, EventListener>>();

	#addListener<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
		once = false,
	) {
		const eventNameString = String(eventName);

		const eventListener = ((customEvent: CustomEvent<Events[TEventName]>) => {
			if (once) {
				this.#removeListener(eventName, listener);
			}

			listener(customEvent.detail);
		}) as EventListener;

		let listenerMap = this.#wrappers.get(eventNameString);

		if (!listenerMap) {
			listenerMap = new Map();
			this.#wrappers.set(eventNameString, listenerMap);
		}

		listenerMap.set(listener, eventListener);

		this.#eventTarget.addEventListener(eventNameString, eventListener);

		return () => this.off(eventName, listener);
	}

	#removeListener<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		const eventNameString = String(eventName);

		const listenerMap = this.#wrappers.get(eventNameString);

		const wrapper = listenerMap?.get(listener);

		if (!wrapper) return;

		this.#eventTarget.removeEventListener(eventNameString, wrapper);

		listenerMap?.delete(listener);

		if (listenerMap?.size === 0) {
			this.#wrappers.delete(eventNameString);
		}
	}

	on<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		return this.#addListener(eventName, listener);
	}

	once<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		return this.#addListener(eventName, listener, true);
	}

	off<TEventName extends keyof Events>(
		eventName: TEventName,
		listener: Listener<Events[TEventName]>,
	) {
		this.#removeListener(eventName, listener);
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
