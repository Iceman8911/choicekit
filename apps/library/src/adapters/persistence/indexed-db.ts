import * as idb from "idb-keyval";
import type { ChoicekitType } from "../../engine/types/Choicekit";

const store = idb.createStore("Choicekit", "kv");

export const IndexedDbPersistenceAdapter: ChoicekitType.PersistenceAdapter = {
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
