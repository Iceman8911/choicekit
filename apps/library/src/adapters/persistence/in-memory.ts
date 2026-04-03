import type { SugarboxType } from "../../engine/types/sugarbox";

const inMemoryMap = new Map<SugarboxType.AnyKey, string>();

/** Based off an in-memory map so changes are lost on program shutdown */
export const InMemoryPersistenceAdapter: SugarboxType.PersistenceAdapter = {
	async delete(key) {
		return inMemoryMap.delete(key);
	},
	async get(key) {
		return inMemoryMap.get(key);
	},
	async keys() {
		return inMemoryMap.keys();
	},
	async set(key, data) {
		inMemoryMap.set(key, data);
	},
};
