import type { ChoicekitType } from "../../engine/types/Choicekit";
import { _getKeysFromWebStorage } from "./_shared";

export const SessionStoragePersistenceAdapter: ChoicekitType.PersistenceAdapter =
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
