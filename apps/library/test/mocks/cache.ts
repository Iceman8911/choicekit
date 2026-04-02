import { mock } from "bun:test";
import QuickLru from "quick-lru";
import type { SugarBoxCacheAdapter } from "../../src/models/adapters";

const createCacheAdapter: () => SugarBoxCacheAdapter<{}> = mock(() => {
	const store = new QuickLru<string, string>({ maxSize: 10 });

	const adapter: SugarBoxCacheAdapter<{}> = {
		clear() {
			store.clear();
		},

		delete(key) {
			store.delete(`${key}`);
		},
		get(key) {
			const val = store.get(`${key}`);

			return val ? JSON.parse(val) : null;
		},

		set(key, val) {
			store.set(`${key}`, JSON.stringify(val));
		},
	};

	return adapter;
});

export { createCacheAdapter };
