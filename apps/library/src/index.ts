import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";
import { SugarboxEngine } from "./engine/if-engine";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./types/adapters";
import type {
	SugarBoxAnyKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxSaveData,
} from "./types/if-engine";
import { InMemoryPersistenceAdapter } from "./utils/persistence-adapters/in-memory";
import { IndexedDbPersistenceAdapter } from "./utils/persistence-adapters/indexed-db";
import { LocalStoragePersistenceAdapter } from "./utils/persistence-adapters/local-storage";
import { SessionStoragePersistenceAdapter } from "./utils/persistence-adapters/session-storage";

export {
	SugarboxEngine,
	type SugarBoxConfig,
	type SugarBoxClassConstructor,
	type SugarBoxClassInstance,
	type SugarBoxAnyKey,
	type SugarBoxPersistenceAdapter,
	type SugarBoxCacheAdapter,
	type SugarBoxExportData,
	type SugarBoxSaveData,
	InMemoryPersistenceAdapter,
	LocalStoragePersistenceAdapter,
	SessionStoragePersistenceAdapter,
	IndexedDbPersistenceAdapter,
};
