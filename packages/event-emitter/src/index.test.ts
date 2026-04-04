import { describe, expect, it } from "bun:test";
import { TypedEventEmitter } from "./index";

const emitter = new TypedEventEmitter<{
	init: boolean;
	final: number;
	update(): void;
}>();

describe(TypedEventEmitter.name, () => {
	it("should strongly type events", () => {
		emitter.emit("final", 3);
		emitter.emit("init", true);
		emitter.emit("update", () => "");
	});

	it("should emit events and run registered listeners", () => {
		let val = 0;

		emitter.on("final", (payload) => {
			val = payload;
		});

		emitter.emit("final", 3);

		expect(val).toBe(3);
	});

	it("should allow registered listeners to be disconnected", () => {
		let val = 0;

		const unsubscribe = emitter.on("final", (payload) => {
			val = payload;
		});

		emitter.emit("final", 3);

		expect(val).toBe(3);

		unsubscribe();

		emitter.emit("final", 4);

		expect(val).toBe(3);

		const listener = (payload: boolean) => {
			val = Number(payload);
		};
		emitter.on("init", listener);
		emitter.emit("init", true);
		expect(val).toBe(1);
		emitter.off("init", listener);
		val = 0;
		emitter.emit("init", false);
		expect(val).toBe(0);
	});

	it("should only run once listeners a single time", () => {
		let callCount = 0;

		emitter.once("final", (payload) => {
			callCount += payload;
		});

		emitter.emit("final", 3);
		emitter.emit("final", 4);

		expect(callCount).toBe(3);
	});
});
