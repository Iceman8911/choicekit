import * as idb from "idb-keyval";
import type { SugarboxType } from "../../engine/types/sugarbox";

const store = idb.createStore("sugarbox", "kv");

export const IndexedDbPersistenceAdapter: SugarboxType.PersistenceAdapter = {
	async delete(key) {
		return idb.del(key, store);
	},

	async get(key) {
		return idb.get(key, store);
	},

	async keys() {
		return idb.keys(store);
	},

	async set(key, data) {
		return idb.set(key, data, store);
	},
};
