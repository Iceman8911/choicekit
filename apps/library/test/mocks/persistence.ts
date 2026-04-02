import { mock } from "bun:test";
import type { GenericPersistenceAdapter } from "../../src/models/adapters";
import type { SugarBoxAnyKey } from "../../src/models/if-engine";

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
