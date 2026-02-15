import type { SugarBoxPersistenceAdapter } from "../../types/adapters";
import { _getKeysFromWebStorage } from "./shared";

export const SessionStoragePersistenceAdapter = {
	async delete(key) {
		sessionStorage.removeItem(key);
	},
	async get(key) {
		return sessionStorage.getItem(key);
	},
	async keys() {
		return _getKeysFromWebStorage(sessionStorage);
	},
	async set(key, data) {
		sessionStorage.setItem(key, data);
	},
} as const satisfies SugarBoxPersistenceAdapter;
