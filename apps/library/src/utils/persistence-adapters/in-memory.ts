import type { SugarBoxPersistenceAdapter } from "../../types/adapters";
import type { SugarBoxAnyKey } from "../../types/if-engine";

const inMemoryMap = new Map<SugarBoxAnyKey, string>();

/** Based off an in-memory map so changes are lost on program shutdown */
export const InMemoryPersistenceAdapter = {
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
} as const satisfies SugarBoxPersistenceAdapter;
