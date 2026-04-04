/// <reference path="./weak-map.types.ts" />

import { beforeEach, describe, expect, test } from "bun:test";
import "./weak-map";

describe("WeakMap.prototype.getOrInsert", () => {
	let weakMap: WeakMap<object, string>;
	let obj1: object;
	let obj2: object;

	beforeEach(() => {
		weakMap = new WeakMap<object, string>();
		obj1 = { id: 1 };
		obj2 = { id: 2 };
	});

	test("should insert and return default value when key does not exist", () => {
		const result = weakMap.getOrInsert(obj1, "default-value");
		expect(result).toBe("default-value");
		expect(weakMap.get(obj1)).toBe("default-value");
	});

	test("should return existing value when key exists", () => {
		weakMap.set(obj1, "existing-value");
		const result = weakMap.getOrInsert(obj1, "default-value");
		expect(result).toBe("existing-value");
		expect(weakMap.get(obj1)).toBe("existing-value");
	});

	test("should work with objects as values", () => {
		const weakMapWithObjects = new WeakMap<object, { count: number }>();
		const defaultObj = { count: 0 };
		const result = weakMapWithObjects.getOrInsert(obj1, defaultObj);
		expect(result).toBe(defaultObj);
		expect(result.count).toBe(0);
	});

	test("should work with null as default value", () => {
		const weakMapWithNull = new WeakMap<object, string | null>();
		const result = weakMapWithNull.getOrInsert(obj1, null);
		expect(result).toBe(null);
		expect(weakMapWithNull.has(obj1)).toBe(true);
	});

	test("should handle multiple keys independently", () => {
		weakMap.getOrInsert(obj1, "value1");
		weakMap.getOrInsert(obj2, "value2");

		expect(weakMap.get(obj1)).toBe("value1");
		expect(weakMap.get(obj2)).toBe("value2");
	});

	test("should work with different object types", () => {
		const arr = [1, 2, 3];
		const func = () => {};
		const date = new Date();

		weakMap.getOrInsert(arr, "array");
		weakMap.getOrInsert(func, "function");
		weakMap.getOrInsert(date, "date");

		expect(weakMap.get(arr)).toBe("array");
		expect(weakMap.get(func)).toBe("function");
		expect(weakMap.get(date)).toBe("date");
	});
});

describe("WeakMap.prototype.getOrInsertComputed", () => {
	let weakMap: WeakMap<object, string>;
	let obj1: object;
	let obj2: object;
	let callCount: number;

	beforeEach(() => {
		weakMap = new WeakMap<object, string>();
		obj1 = { id: 1 };
		obj2 = { id: 2 };
		callCount = 0;
	});

	test("should compute and insert value when key does not exist", () => {
		const result = weakMap.getOrInsertComputed(obj1, (key) => {
			callCount++;
			return `computed-${(key as { id: number }).id}`;
		});

		expect(result).toBe("computed-1");
		expect(weakMap.get(obj1)).toBe("computed-1");
		expect(callCount).toBe(1);
	});

	test("should not call callback when key exists", () => {
		weakMap.set(obj1, "existing-value");

		const result = weakMap.getOrInsertComputed(obj1, (_key) => {
			callCount++;
			return "new-value";
		});

		expect(result).toBe("existing-value");
		expect(weakMap.get(obj1)).toBe("existing-value");
		expect(callCount).toBe(0);
	});

	test("should pass correct key to callback", () => {
		let receivedKey: object | undefined;

		weakMap.getOrInsertComputed(obj1, (key) => {
			receivedKey = key;
			return "value";
		});

		expect(receivedKey).toBe(obj1);
	});

	test("should work with complex computed values", () => {
		const weakMapWithObjects = new WeakMap<
			object,
			{ ref: object; timestamp: number }
		>();

		const result = weakMapWithObjects.getOrInsertComputed(obj1, (key) => ({
			ref: key,
			timestamp: Date.now(),
		}));

		expect(result.ref).toBe(obj1);
		expect(typeof result.timestamp).toBe("number");
	});

	test("should handle multiple keys with different computations", () => {
		const result1 = weakMap.getOrInsertComputed(
			obj1,
			(key) => `value-${(key as { id: number }).id}`,
		);
		const result2 = weakMap.getOrInsertComputed(
			obj2,
			(key) => `value-${(key as { id: number }).id}`,
		);

		expect(result1).toBe("value-1");
		expect(result2).toBe("value-2");
	});

	test("should work with private data pattern", () => {
		class Counter {
			private static counts = new WeakMap<Counter, number>();

			increment(): number {
				const current = Counter.counts.getOrInsert(this, 0);
				Counter.counts.set(this, current + 1);
				return Counter.counts.getOrInsert(this, 0);
			}

			getCount(): number {
				return Counter.counts.getOrInsert(this, 0);
			}
		}

		const counter = new Counter();
		expect(counter.getCount()).toBe(0);
		expect(counter.increment()).toBe(1);
		expect(counter.increment()).toBe(2);
		expect(counter.getCount()).toBe(2);
	});
});

describe("WeakMap polyfill installation", () => {
	test("WeakMap.prototype.getOrInsert should be installed", () => {
		expect(typeof WeakMap.prototype.getOrInsert).toBe("function");
	});

	test("WeakMap.prototype.getOrInsertComputed should be installed", () => {
		expect(typeof WeakMap.prototype.getOrInsertComputed).toBe("function");
	});
});
