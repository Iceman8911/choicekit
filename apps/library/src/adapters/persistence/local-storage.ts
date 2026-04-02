import type { SugarBoxPersistenceAdapter } from "../../_internal/models/adapters";
import { _getKeysFromWebStorage } from "./shared";

const LocalStoragePersistenceAdapter = {
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
} as const satisfies SugarBoxPersistenceAdapter;

export default LocalStoragePersistenceAdapter;
