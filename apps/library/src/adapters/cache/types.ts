import type { SugarBoxSnapshotMetadata } from "../../_internal/models/if-engine";
import type { GenericSerializableObject } from "../../_internal/models/shared";

/** Interface that any cache infrastructure must abide to */
type CacheAdapter<TKey, TData> = {
	set(key: TKey, data: TData): unknown;

	get(key: TKey): TData | undefined | null;

	delete(key: TKey): unknown;

	clear(): unknown;
};

/** Cache Adapter specifically for caching the state of variables */
export type SugarBoxCacheAdapter<
	TStateVariables extends GenericSerializableObject,
> = CacheAdapter<number, TStateVariables & SugarBoxSnapshotMetadata>;
