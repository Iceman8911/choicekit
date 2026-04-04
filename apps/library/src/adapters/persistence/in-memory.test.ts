import { describe, expect, it } from "bun:test";
import { InMemoryPersistenceAdapter } from "./in-memory";

const keyA = "Choicekit-test-in-memory-slot1" as const;
const keyB = "Choicekit-test-in-memory-slot2" as const;

describe("InMemoryPersistenceAdapter", () => {
	it("should set and get values", async () => {
		await InMemoryPersistenceAdapter.delete(keyA);

		await InMemoryPersistenceAdapter.set(keyA, "payload-A");

		expect(await InMemoryPersistenceAdapter.get(keyA)).toBe("payload-A");
	});

	it("should delete values", async () => {
		await InMemoryPersistenceAdapter.set(keyA, "payload-A");

		await InMemoryPersistenceAdapter.delete(keyA);

		expect(await InMemoryPersistenceAdapter.get(keyA)).toBeUndefined();
	});

	it("should return all keys", async () => {
		await InMemoryPersistenceAdapter.delete(keyA);
		await InMemoryPersistenceAdapter.delete(keyB);

		await InMemoryPersistenceAdapter.set(keyA, "payload-A");
		await InMemoryPersistenceAdapter.set(keyB, "payload-B");

		const keys = Array.from((await InMemoryPersistenceAdapter.keys?.()) ?? []);

		expect(keys).toContain(keyA);
		expect(keys).toContain(keyB);
	});
});
