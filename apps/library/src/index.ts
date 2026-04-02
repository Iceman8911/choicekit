import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";
import { SugarboxEngineBuilder } from "./engine/builder";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./models/adapters";
import type {
	SugarBoxAnyKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxSaveData,
} from "./models/if-engine";
import { InMemoryPersistenceAdapter } from "./utils/persistence-adapters/in-memory";
import { IndexedDbPersistenceAdapter } from "./utils/persistence-adapters/indexed-db";
import { LocalStoragePersistenceAdapter } from "./utils/persistence-adapters/local-storage";
import { SessionStoragePersistenceAdapter } from "./utils/persistence-adapters/session-storage";

export {
	IndexedDbPersistenceAdapter,
	InMemoryPersistenceAdapter,
	LocalStoragePersistenceAdapter,
	SessionStoragePersistenceAdapter,
	type SugarBoxAnyKey,
	type SugarBoxCacheAdapter,
	type SugarBoxClassConstructor,
	type SugarBoxClassInstance,
	type SugarBoxConfig,
	type SugarBoxExportData,
	type SugarBoxPersistenceAdapter,
	type SugarBoxSaveData,
	SugarboxEngineBuilder,
};
