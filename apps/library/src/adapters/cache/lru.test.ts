import { describe, expect, it } from "bun:test";
import type { ChoicekitType } from "../../engine/types/Choicekit";
import { createLruCacheAdapter } from "./lru";

type Vars = {
	hp: number;
};

type Snapshot = Vars & ChoicekitType.SnapshotMetadata;

const createSnapshot = (index: number): Snapshot => ({
	$$id: `passage-${index}`,
	$$plugins: new Map(),
	$$seed: index,
	hp: 10 + index,
});

describe("createLruCacheAdapter", () => {
	it("should set and get snapshots", () => {
		const adapter = createLruCacheAdapter<Vars>({ maxEntries: 3 });

		adapter.set(1, createSnapshot(1));

		expect(adapter.get(1)?.$$id).toBe("passage-1");
	});

	it("should delete snapshots", () => {
		const adapter = createLruCacheAdapter<Vars>({ maxEntries: 3 });

		adapter.set(1, createSnapshot(1));
		adapter.delete(1);

		expect(adapter.get(1)).toBeUndefined();
	});

	it("should clear snapshots", () => {
		const adapter = createLruCacheAdapter<Vars>({ maxEntries: 3 });

		adapter.set(1, createSnapshot(1));
		adapter.set(2, createSnapshot(2));
		adapter.clear();

		expect(adapter.get(1)).toBeUndefined();
		expect(adapter.get(2)).toBeUndefined();
	});

	it("should evict least recently used snapshots", () => {
		const adapter = createLruCacheAdapter<Vars>({ maxEntries: 2 });

		adapter.set(1, createSnapshot(1));
		adapter.set(2, createSnapshot(2));
		adapter.get(1);
		adapter.set(3, createSnapshot(3));

		expect(adapter.get(2)).toBeUndefined();
		expect(adapter.get(1)?.$$id).toBe("passage-1");
		expect(adapter.get(3)?.$$id).toBe("passage-3");
	});
});
