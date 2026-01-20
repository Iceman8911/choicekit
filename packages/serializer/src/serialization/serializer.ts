import type { SugarBoxClassConstructor } from "@packages/engine-class";
import type { GenericObject } from "../types/shared";

type TransformedType<TTypeName extends string | number, TTransformedValue> = {
	/** The name of the original data type */
	$$t: TTypeName;
	/** The JSON.stringify compatible transformed value that can be reconverted back to the original data type */
	$$v: TTransformedValue;
};

/**
 * Represents a transformed custom class instance with its class identifier and serialized data.
 */
type TransformedClass = TransformedType<
	typeof TYPE_CLASS,
	{
		/** The class id since depending on the class's name is fragile (minifiers will mangle it) */
		id: string;
		data: unknown;
	}
>;

/**
 * Represents a transformed Date object in milliseconds
 */
type TransformedDate = TransformedType<typeof TYPE_DATE, number>;

/**
 * Represents a transformed Set object with its values as an array.
 */
type TransformedSet = TransformedType<typeof TYPE_SET, ReadonlyArray<unknown>>;

/**
 * Represents a transformed Map object with its entries as an array of key-value pairs.
 */
type TransformedMap = TransformedType<
	typeof TYPE_MAP,
	ReadonlyArray<[unknown, unknown]>
>;

/**
 * Represents a transformed BigInt value as a string representation.
 */
type TransformedBigInt = TransformedType<typeof TYPE_BIGINT, string>;

/**
 * Represents a transformed Infinity value as a string representation.
 */
type TransformedInfinity = TransformedType<typeof TYPE_INFINITY, "+" | "-">;

/**
 * Represents a transformed NaN value as a string representation.
 */
type TransformedNan = TransformedType<typeof TYPE_NAN, "">;

/**
 * Represents a reference to an already serialized object
 */
type TransformedReference = TransformedType<typeof TYPE_REFERENCE, number>;

/**
 * Union type representing all possible transformed data types for serialization.
 */
type TransformedDataType =
	| TransformedClass
	| TransformedDate
	| TransformedSet
	| TransformedMap
	| TransformedInfinity
	| TransformedNan
	| TransformedBigInt
	| TransformedReference;

type ClassConstructor = SugarBoxClassConstructor<unknown>;

// Don't alter pervious values else saves will be broken. I explicitly chose to use primitive constants since they minify better
const TYPE_CLASS = 1,
	TYPE_DATE = 2,
	TYPE_SET = 3,
	TYPE_MAP = 4,
	TYPE_BIGINT = 5,
	TYPE_INFINITY = 6,
	TYPE_NAN = 7,
	TYPE_REFERENCE = 8;

const TRANSFORMED_DATA_TYPE_COMMON_KEY: keyof TransformedDataType = "$$t";

/** Key to store the ID on the definition side */
const REF_KEY = "$$r";

const classRegistry = new Map<string, ClassConstructor>();

const isArray = (obj: unknown): obj is Array<unknown> => Array.isArray(obj);

const arrayFrom = Array.from;

// Register a custom class for serialization
export const registerClass = (
	classConstructor: ClassConstructor,
): Map<string, ClassConstructor> =>
	classRegistry.set(classConstructor.classId, classConstructor);

const tranformObjPropsForSerialization = (obj: object) => {
	const result: GenericObject = {};

	for (const key in obj) {
		//@ts-expect-error This is not an error
		result[key] = transformForSerialization(obj[key]);
	}

	return result;
};

const transformForSerialization = (
	data: unknown,
	seen = new Map<object, number>(),
): TransformedDataType | unknown => {
	if (data == null || typeof data !== "object") {
		// Handle primitives and BigInt (which isn't 'object')
		if (typeof data === "bigint") {
			return { $$t: TYPE_BIGINT, $$v: `${data}` } as TransformedBigInt;
		}
		if (typeof data === "number") {
			if (data === Infinity)
				return { $$t: TYPE_INFINITY, $$v: "+" } as TransformedInfinity;
			if (data === -Infinity)
				return { $$t: TYPE_INFINITY, $$v: "-" } as TransformedInfinity;
			if (Number.isNaN(data))
				return { $$t: TYPE_NAN, $$v: "" } as TransformedNan;
		}
		return data;
	}

	// Circular Reference Check
	if (seen.has(data)) {
		return {
			$$t: TYPE_REFERENCE,
			$$v: seen.get(data as object),
		} as TransformedReference;
	}

	// Register new object
	const refId = seen.size;
	seen.set(data, refId);

	let result: unknown;

	if (isArray(data)) {
		result = data.map((item) => transformForSerialization(item, seen));
	} else if (data instanceof Date) {
		result = { $$t: TYPE_DATE, $$v: data.getTime() };
	} else if (data instanceof Map) {
		result = {
			$$t: TYPE_MAP,
			$$v: arrayFrom(data, ([k, v]) => [
				transformForSerialization(k, seen),
				transformForSerialization(v, seen),
			]),
		};
	} else if (data instanceof Set) {
		result = {
			$$t: TYPE_SET,
			$$v: arrayFrom(data, (v) => transformForSerialization(v, seen)),
		};
	} else {
		/** Custom Class or Plain Object */
		let isCustom = false;
		for (const [classId, ClassConstructor] of classRegistry) {
			if (data instanceof ClassConstructor) {
				isCustom = true;
				result = {
					$$t: TYPE_CLASS,
					$$v: {
						data: transformForSerialization(data.toJSON(), seen),
						id: classId,
					},
				};
				break;
			}
		}

		if (!isCustom) {
			result = tranformObjPropsForSerialization(data);
		}
	}

	if (typeof result === "object" && result !== null) {
		//@ts-expect-error Attach the reference ID to the transformed output
		result[REF_KEY] = refId;
	}

	return result;
};

const transformFromSerialization = (
	obj: unknown,
	cache = new Map<number, unknown>(),
): unknown => {
	if (obj == null || typeof obj !== "object") return obj;

	//@ts-expect-error This will either be undefiend or our ref reference
	const refId: number | undefined = obj[REF_KEY];

	const doesRefIdExist = refId != null;

	const possiblyPretransformedInput = obj as TransformedDataType;

	const type = possiblyPretransformedInput[TRANSFORMED_DATA_TYPE_COMMON_KEY];

	// If it's a reference pointer, return the cached object immediately
	if (
		possiblyPretransformedInput[TRANSFORMED_DATA_TYPE_COMMON_KEY] ===
		TYPE_REFERENCE
	) {
		return cache.get(possiblyPretransformedInput.$$v);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <I'll strengthen the types later>
	let result: any;

	if (isArray(possiblyPretransformedInput)) {
		result = [];
		if (doesRefIdExist) cache.set(refId, result);
		for (const item of possiblyPretransformedInput) {
			result.push(transformFromSerialization(item, cache));
		}
		return result;
	}

	if (type !== undefined) {
		switch (type) {
			case TYPE_DATE:
				result = new Date(possiblyPretransformedInput.$$v);
				break;
			case TYPE_SET:
				result = new Set();
				if (doesRefIdExist) cache.set(refId, result);
				for (const v of possiblyPretransformedInput.$$v) {
					result.add(transformFromSerialization(v, cache));
				}
				return result;
			case TYPE_MAP:
				result = new Map();
				if (doesRefIdExist) cache.set(refId, result);
				for (const [k, v] of possiblyPretransformedInput.$$v) {
					result.set(
						transformFromSerialization(k, cache),
						transformFromSerialization(v, cache),
					);
				}
				return result;
			case TYPE_BIGINT:
				return BigInt(possiblyPretransformedInput.$$v);
			case TYPE_INFINITY:
				return possiblyPretransformedInput.$$v === "+" ? Infinity : -Infinity;
			case TYPE_NAN:
				return NaN;
			case TYPE_CLASS: {
				const classConstructor = classRegistry.get(
					possiblyPretransformedInput.$$v.id,
				);

				const transformedData = transformFromSerialization(
					possiblyPretransformedInput.$$v.data,
					cache,
				);
				result = classConstructor?.fromJSON(transformedData);
				break;
			}
		}
	} else {
		// Regular Object
		result = {};
		if (doesRefIdExist) cache.set(refId, result);

		for (const key in possiblyPretransformedInput as object) {
			if (key === REF_KEY) continue;
			result[key] = transformFromSerialization(
				possiblyPretransformedInput[key],
				cache,
			);
		}
	}

	if (doesRefIdExist && !cache.has(refId)) {
		cache.set(refId, result);
	}

	return result;
};

const serialize = (obj: unknown): string =>
	JSON.stringify(transformForSerialization(obj));

// biome-ignore lint/suspicious/noExplicitAny: <Impractical to specify all types here>
const deserialize = (str: string): any =>
	transformFromSerialization(JSON.parse(str));

export { serialize, deserialize };
