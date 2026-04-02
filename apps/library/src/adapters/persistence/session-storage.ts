import { _getKeysFromWebStorage } from "./_shared";
import type { SugarBoxPersistenceAdapter } from "./types";

const SessionStoragePersistenceAdapter: SugarBoxPersistenceAdapter = {
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
};

export default SessionStoragePersistenceAdapter;
