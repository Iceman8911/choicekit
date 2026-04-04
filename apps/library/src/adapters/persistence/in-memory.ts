import type { ChoicekitType } from "../../engine/types/Choicekit";

const inMemoryMap = new Map<ChoicekitType.AnyKey, string>();

/** Based off an in-memory map so changes are lost on program shutdown */
export const InMemoryPersistenceAdapter: ChoicekitType.PersistenceAdapter = {
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
