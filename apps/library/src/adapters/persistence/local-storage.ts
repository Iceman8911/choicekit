import type { SugarboxType } from "../../engine/types/sugarbox";
import { _getKeysFromWebStorage } from "./_shared";

export const LocalStoragePersistenceAdapter: SugarboxType.PersistenceAdapter = {
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
