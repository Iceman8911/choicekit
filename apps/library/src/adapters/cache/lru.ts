import { lru } from "tiny-lru";
import type { GenericSerializableObject } from "../../_internal/models/shared";
import type { ChoicekitType } from "../../engine/types/Choicekit";

export type CreateLruCacheAdapterOptions = {
	/** Maximum number of snapshots to retain in memory */
	maxEntries?: number;

	/** Optional TTL in milliseconds. 0 disables expiration. */
	ttlMs?: number;

	/** Reset TTL when setting an existing key */
	resetTtlOnSet?: boolean;
};

/** Creates a bounded LRU cache adapter for Choicekit state snapshots. */
export function createLruCacheAdapter<
	TStateVariables extends GenericSerializableObject,
>(
	options: CreateLruCacheAdapterOptions = {},
): ChoicekitType.CacheAdapter<TStateVariables> {
	const { maxEntries = 100, ttlMs = 0, resetTtlOnSet = false } = options;

	const cache = lru<TStateVariables & ChoicekitType.SnapshotMetadata>(
		maxEntries,
		ttlMs,
		resetTtlOnSet,
	);

	return cache;
}
