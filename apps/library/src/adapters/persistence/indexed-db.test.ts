import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "bun:test";
import { IndexedDbPersistenceAdapter } from "./indexed-db";

const keyA = "Choicekit-test-indexed-slot1" as const;
const keyB = "Choicekit-test-indexed-slot2" as const;

describe("IndexedDbPersistenceAdapter", () => {
	beforeEach(async () => {
		await IndexedDbPersistenceAdapter.delete(keyA);
		await IndexedDbPersistenceAdapter.delete(keyB);
	});

	it("should set and get values", async () => {
		await IndexedDbPersistenceAdapter.set(keyA, "payload-A");

		expect(await IndexedDbPersistenceAdapter.get(keyA)).toBe("payload-A");
	});

	it("should delete values", async () => {
		await IndexedDbPersistenceAdapter.set(keyA, "payload-A");
		await IndexedDbPersistenceAdapter.delete(keyA);

		expect(await IndexedDbPersistenceAdapter.get(keyA)).toBeUndefined();
	});

	it("should return all keys", async () => {
		await IndexedDbPersistenceAdapter.set(keyA, "payload-A");
		await IndexedDbPersistenceAdapter.set(keyB, "payload-B");

		const keysMethod = IndexedDbPersistenceAdapter.keys;
		expect(keysMethod).toBeDefined();
		if (!keysMethod) throw new Error("keys() is not implemented");

		const keys = Array.from(await keysMethod());

		expect(keys).toContain(keyA);
		expect(keys).toContain(keyB);
	});
});
