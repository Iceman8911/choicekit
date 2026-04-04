import type { ChoicekitType } from "../../engine/types/Choicekit";
import { _getKeysFromWebStorage } from "./_shared";

export const LocalStoragePersistenceAdapter: ChoicekitType.PersistenceAdapter =
	{
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
