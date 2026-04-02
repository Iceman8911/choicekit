import { _getKeysFromWebStorage } from "./_shared";
import type { SugarBoxPersistenceAdapter } from "./types";

const LocalStoragePersistenceAdapter: SugarBoxPersistenceAdapter = {
	async delete(key) {
		localStorage.removeItem(key);
	},
	async get(key) {
		return localStorage.getItem(key);
	},
	async keys() {
		return _getKeysFromWebStorage(localStorage);
	},
	async set(key, data) {
		localStorage.setItem(key, data);
	},
};

export default LocalStoragePersistenceAdapter;
