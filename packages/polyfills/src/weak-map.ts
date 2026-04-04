/// <reference path="./weak-map.d.ts" />

WeakMap.prototype.getOrInsert ??= function <K extends object, V>(
	this: WeakMap<K, V>,
	key: K,
	defaultValue: V,
): V {
	if (!this.has(key)) {
		this.set(key, defaultValue);
	}
	return this.get(key) as V;
};

WeakMap.prototype.getOrInsertComputed ??= function <K extends object, V>(
	this: WeakMap<K, V>,
	key: K,
	callbackFunction: (key: K) => V,
): V {
	if (!this.has(key)) {
		this.set(key, callbackFunction(key));
	}
	return this.get(key) as V;
};

export {};
