import "mock-local-storage";
import { beforeEach, describe, expect, it } from "bun:test";
import { LocalStoragePersistenceAdapter } from "./local-storage";

const keyA = "sugarbox-test-local-slot1" as const;
const keyB = "sugarbox-test-local-slot2" as const;

describe("LocalStoragePersistenceAdapter", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("should set and get values", async () => {
		await LocalStoragePersistenceAdapter.set(keyA, "payload-A");

		expect(await LocalStoragePersistenceAdapter.get(keyA)).toBe("payload-A");
	});

	it("should delete values", async () => {
		await LocalStoragePersistenceAdapter.set(keyA, "payload-A");
		await LocalStoragePersistenceAdapter.delete(keyA);

		expect(await LocalStoragePersistenceAdapter.get(keyA)).toBeNull();
	});

	it("should return all keys", async () => {
		await LocalStoragePersistenceAdapter.set(keyA, "payload-A");
		await LocalStoragePersistenceAdapter.set(keyB, "payload-B");

		const keysMethod = LocalStoragePersistenceAdapter.keys;
		expect(keysMethod).toBeDefined();
		if (!keysMethod) throw new Error("keys() is not implemented");

		const keys = Array.from(await keysMethod());

		expect(keys).toContain(keyA);
		expect(keys).toContain(keyB);
	});
});
