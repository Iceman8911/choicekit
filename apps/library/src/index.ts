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
};
