import "mock-local-storage";
import { beforeEach, describe, expect, it } from "bun:test";
import { SessionStoragePersistenceAdapter } from "./session-storage";

const keyA = "Choicekit-test-session-slot1" as const;
const keyB = "Choicekit-test-session-slot2" as const;

describe("SessionStoragePersistenceAdapter", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("should set and get values", async () => {
		await SessionStoragePersistenceAdapter.set(keyA, "payload-A");

		expect(await SessionStoragePersistenceAdapter.get(keyA)).toBe("payload-A");
	});

	it("should delete values", async () => {
		await SessionStoragePersistenceAdapter.set(keyA, "payload-A");
		await SessionStoragePersistenceAdapter.delete(keyA);

		expect(await SessionStoragePersistenceAdapter.get(keyA)).toBeNull();
	});

	it("should return all keys", async () => {
		await SessionStoragePersistenceAdapter.set(keyA, "payload-A");
		await SessionStoragePersistenceAdapter.set(keyB, "payload-B");

		const keysMethod = SessionStoragePersistenceAdapter.keys;
		expect(keysMethod).toBeDefined();
		if (!keysMethod) throw new Error("keys() is not implemented");

		const keys = Array.from(await keysMethod());

		expect(keys).toContain(keyA);
		expect(keys).toContain(keyB);
	});
});
