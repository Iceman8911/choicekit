import { mock } from "bun:test";
import type { GenericPersistenceAdapter } from "../../src/types/adapters";
import type { SugarBoxAnyKey } from "../../src/types/if-engine";

const createPersistenceAdapter: () => GenericPersistenceAdapter<
	SugarBoxAnyKey,
	string
> = mock(() => {
	const store = new Map<SugarBoxAnyKey, string>();

	const adapter: GenericPersistenceAdapter<SugarBoxAnyKey, string> = {
		async delete(key) {
			store.delete(key);
		},
		async get(key) {
			return store.get(key);
		},

		async keys() {
			return store.keys();
		},

		async set(key, val) {
			store.set(key, val);
		},
	};

	return adapter;
});

export { createPersistenceAdapter };
