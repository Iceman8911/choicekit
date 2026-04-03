import type { SugarBoxAnyKey } from "../../engine/core/if-engine.types";
import type { SugarBoxPersistenceAdapter } from "./types";

const INDEXED_DB_NAME = "sugarbox";
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = "kv";

const openIndexedDb = async (): Promise<IDBDatabase> => {
	return await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
				db.createObjectStore(INDEXED_DB_STORE);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
};

export const IndexedDbPersistenceAdapter: SugarBoxPersistenceAdapter = {
	async delete(key) {
		const db = await openIndexedDb();
		try {
			return await new Promise<boolean>((resolve, reject) => {
				const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
				const store = tx.objectStore(INDEXED_DB_STORE);

				store.delete(key);

				tx.oncomplete = () => resolve(true);
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	},

	async get(key) {
		const db = await openIndexedDb();
		try {
			return await new Promise<string | undefined | null>((resolve, reject) => {
				const tx = db.transaction(INDEXED_DB_STORE, "readonly");
				const store = tx.objectStore(INDEXED_DB_STORE);
				const req = store.get(key);

				req.onsuccess = () => {
					// `IDBRequest.result` is `any` and will be `undefined` when missing.
					resolve(req.result as string | undefined);
				};
				req.onerror = () => reject(req.error);
			});
		} finally {
			db.close();
		}
	},

	async keys() {
		const db = await openIndexedDb();
		try {
			return await new Promise<IterableIterator<SugarBoxAnyKey>>(
				(resolve, reject) => {
					const keys: SugarBoxAnyKey[] = [];
					const tx = db.transaction(INDEXED_DB_STORE, "readonly");
					const store = tx.objectStore(INDEXED_DB_STORE);
					const req = store.openKeyCursor();

					req.onsuccess = () => {
						const cursor = req.result;
						if (cursor) {
							keys.push(cursor.key as SugarBoxAnyKey);
							cursor.continue();
						} else {
							resolve(keys[Symbol.iterator]());
						}
					};

					req.onerror = () => reject(req.error);
					tx.onerror = () => reject(tx.error);
					tx.onabort = () => reject(tx.error);
				},
			);
		} finally {
			db.close();
		}
	},

	async set(key, data) {
		const db = await openIndexedDb();
		try {
			return await new Promise<boolean>((resolve, reject) => {
				const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
				const store = tx.objectStore(INDEXED_DB_STORE);

				store.put(data, key);

				tx.oncomplete = () => resolve(true);
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	},
};
