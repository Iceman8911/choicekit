import type { SugarBoxAnyKey } from "../../_internal/models/if-engine";
import type { SugarBoxPersistenceAdapter } from "./types";

const inMemoryMap = new Map<SugarBoxAnyKey, string>();

/** Based off an in-memory map so changes are lost on program shutdown */
const InMemoryPersistenceAdapter: SugarBoxPersistenceAdapter = {
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

export default InMemoryPersistenceAdapter;
