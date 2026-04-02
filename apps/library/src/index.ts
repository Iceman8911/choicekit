import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./_internal/models/adapters";
import type {
	SugarBoxAnyKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxSaveData,
} from "./_internal/models/if-engine";
import InMemoryPersistenceAdapter from "./adapters/persistence/in-memory";
import IndexedDbPersistenceAdapter from "./adapters/persistence/indexed-db";
import LocalStoragePersistenceAdapter from "./adapters/persistence/local-storage";
import SessionStoragePersistenceAdapter from "./adapters/persistence/session-storage";
import { SugarboxEngineBuilder } from "./engine/builder";

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
