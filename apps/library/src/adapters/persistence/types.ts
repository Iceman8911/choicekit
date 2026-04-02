import type { SugarBoxAnyKey } from "../../_internal/models/if-engine";

/** Interface that any persistence infrastructure must abide to */
type PersistenceAdapter<TKey, TData> = {
	set(key: TKey, data: TData): Promise<unknown>;

	get(key: TKey): Promise<TData | undefined | null>;

	delete(key: TKey): Promise<unknown>;

	/** If provided, makes returning an iterable / list of used save slots more efficient. Otherwise, `get()` will be used as a workaround */
	keys?(): Promise<Iterable<TKey | string>>;
};

/** Persistence Adapter specifically for saving the state of variables */
export type SugarBoxPersistenceAdapter = PersistenceAdapter<
	SugarBoxAnyKey,
	string
>;
