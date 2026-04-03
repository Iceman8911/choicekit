import type { SugarboxType } from "../../engine/types/sugarbox";
import { _getKeysFromWebStorage } from "./_shared";

export const SessionStoragePersistenceAdapter: SugarboxType.PersistenceAdapter =
	{
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
