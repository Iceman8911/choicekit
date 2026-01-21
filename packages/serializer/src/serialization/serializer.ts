import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";

/** Since arrays are converted to a transformed object, there aren't included as-is here */
type JsonSerializableType =
	| number
	| boolean
	| null
	| undefined
	| string
	| {
			[key: string]: JsonSerializableType;
	  }
	| TransformedDataType;

export interface SugarboxClassConstructorWithValidSerialization
	extends SugarBoxClassConstructor<TransformableOrJsonSerializableType> {}
interface SugarboxClassInstanceWithValidSerialization
	extends SugarBoxClassInstance<TransformableOrJsonSerializableType> {}

type TransformableType =
	| Array<TransformableOrJsonSerializableType>
	| { [key: string]: TransformableOrJsonSerializableType }
	| Date
	| Map<
			TransformableOrJsonSerializableType,
			TransformableOrJsonSerializableType
	  >
	| Set<TransformableOrJsonSerializableType>
	| bigint
	| SugarboxClassInstanceWithValidSerialization;

export type TransformableOrJsonSerializableType =
	| TransformableType
	| JsonSerializableType;

type TransformedType<
	TTypeName extends string | number,
	TTransformedValue,
	TShouldAccountForCircularRef extends boolean = false,
> = {
	/** The name of the original data type */
	$$t: TTypeName;
	/** The JSON.stringify compatible transformed value that can be reconverted back to the original data type */
	$$v: TTransformedValue;
} & (TShouldAccountForCircularRef extends true
	? {
			/** Only found on anything that could be a circular reference. Is the object's reference id. Used to detect circular references */
			$$r: number;
		}
	: { $$r?: never });

/**
 * Represents a transformed custom class instance with its class identifier and serialized data.
 */
type TransformedClass = TransformedType<
	typeof TYPE_CLASS,
	{
		/** The class id since depending on the class's name is fragile (minifiers will mangle it) */
		id: string;

		/** The serialized data of the class instance */
		data: JsonSerializableType;
	},
	true
>;

/**
 * Represents a transformed Date object in milliseconds
 */
type TransformedDate = TransformedType<typeof TYPE_DATE, number, true>;

/**
 * Represents a transformed Set object with its values as an array.
 */
type TransformedSet = TransformedType<
	typeof TYPE_SET,
	Array<JsonSerializableType>,
	true
>;

/**
 * Represents a transformed Map object with its entries as an array of key-value pairs.
 */
type TransformedMap = TransformedType<
	typeof TYPE_MAP,
	Array<[JsonSerializableType, JsonSerializableType]>,
	true
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
 * Represents a reference to an already serialized object. Where the value is the reference ID to a serialized object with a `$$r` key of same value.
 */
type TransformedDeduplicatedReference = TransformedType<
	typeof TYPE_REFERENCE,
	number
>;

/**
 * Represents a serialized array. Since an array could suffer from circular referencing issues, and I only transform data in a single pass (so I can't infer if there will actually be no circular references in the data).
 */
type TransformedArray = TransformedType<
	typeof TYPE_ARRAY,
	Array<JsonSerializableType>,
	true
>;

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
	| TransformedDeduplicatedReference
	| TransformedArray;

// Don't alter pervious values else saves will be broken. I explicitly chose to use primitive constants since they minify better
const TYPE_CLASS = 1,
	TYPE_DATE = 2,
	TYPE_SET = 3,
	TYPE_MAP = 4,
	TYPE_BIGINT = 5,
	TYPE_INFINITY = 6,
	TYPE_NAN = 7,
	TYPE_REFERENCE = 8,
	TYPE_ARRAY = 9;

const POSITIVE_INFINITY = Infinity,
	NEGATIVE_INIFINITY = -Infinity;

// Double mapping is for O(1) operations

const classRegistrybyId = new Map<
	string,
	SugarboxClassConstructorWithValidSerialization
>();

const classRegistrybyConstructor = new WeakMap<
	SugarboxClassConstructorWithValidSerialization,
	string
>();

const isArray = (obj: unknown): obj is Array<unknown> => Array.isArray(obj);

const arrayFrom = Array.from;

// Register a custom class for serialization
export const registerClass = (
	classConstructor: SugarboxClassConstructorWithValidSerialization,
): void => {
	const id = classConstructor.classId;

	classRegistrybyId.set(id, classConstructor);
	classRegistrybyConstructor.set(classConstructor, id);
};

const transformForSerialization = (
	data: TransformableOrJsonSerializableType,
	/** Used to detect circular references
	 *
	 * Key - Object reference
	 * Value - Ref Id
	 */
	seen = new Map<object, number>(),
): JsonSerializableType => {
	// I'm alright having undefined and null values treated the same
	if (data == null) {
		return null;
	}

	switch (typeof data) {
		case "boolean":
		case "string":
			return data;
		case "number": {
			if (data === POSITIVE_INFINITY)
				return { $$t: TYPE_INFINITY, $$v: "+" } as TransformedInfinity;
			if (data === NEGATIVE_INIFINITY)
				return { $$t: TYPE_INFINITY, $$v: "-" } as TransformedInfinity;
			if (Number.isNaN(data))
				return { $$t: TYPE_NAN, $$v: "" } as TransformedNan;

			return data;
		}
		case "bigint":
			return { $$t: TYPE_BIGINT, $$v: `${data}` } as TransformedBigInt;
	}

	// Circular Reference Check
	const possibleRefId = seen.get(data);
	if (possibleRefId != null) {
		return {
			$$t: TYPE_REFERENCE,
			$$v: possibleRefId,
		} as TransformedDeduplicatedReference;
	}

	// Register new object
	const newRefId = seen.size;
	seen.set(data, newRefId);

	if (isArray(data)) {
		return {
			$$r: newRefId,
			$$t: TYPE_ARRAY,
			$$v: data.map((item) => transformForSerialization(item, seen)),
		};
	} else if (data instanceof Date) {
		return { $$r: newRefId, $$t: TYPE_DATE, $$v: data.getTime() };
	} else if (data instanceof Map) {
		return {
			$$r: newRefId,
			$$t: TYPE_MAP,
			$$v: arrayFrom(
				data,
				([k, v]) =>
					[
						transformForSerialization(k, seen),
						transformForSerialization(v, seen),
					] as [JsonSerializableType, JsonSerializableType],
			),
		};
	} else if (data instanceof Set) {
		return {
			$$r: newRefId,
			$$t: TYPE_SET,
			$$v: arrayFrom(data, (v) => transformForSerialization(v, seen)),
		};
	} else {
		/** Custom Class or Plain Object */

		//@ts-expect-error I'll check whether this is actually registered, since there's no concise, typesafe way of proving that this may be a class
		const possibleClass: SugarboxClassInstanceWithValidSerialization = data;
		const possibleClassId = classRegistrybyConstructor.get(
			possibleClass.constructor,
		);

		if (possibleClassId != null) {
			return {
				$$r: newRefId,
				$$t: TYPE_CLASS,
				$$v: {
					data: transformForSerialization(possibleClass.toJSON(), seen),
					id: possibleClassId,
				},
			};
		}

		const transformedObject: Record<string, JsonSerializableType> = {};

		for (const key in data) {
			transformedObject[key] = transformForSerialization(
				(data as Record<string, TransformableOrJsonSerializableType>)[key],
				seen,
			);
		}

		transformedObject.$$r = newRefId;

		return transformedObject;
	}
};

const transformFromSerialization = (
	data: JsonSerializableType,
	cache = new Map<number, TransformableOrJsonSerializableType>(),
): TransformableOrJsonSerializableType => {
	if (data == null) return null;

	switch (typeof data) {
		case "string":
		case "number":
		case "boolean":
			return data;
	}

	// Deal with relevant custom transformations
	const { $$t, $$v, $$r } = data as TransformedDataType;
	switch ($$t) {
		case TYPE_CLASS: {
			const classConstructor = classRegistrybyId.get($$v.id);

			if (!classConstructor)
				throw Error(`Class constructor with id ${$$v.id} not found`);

			const revivedClass = classConstructor.fromJSON($$v.data);

			cache.set($$r, revivedClass);

			return revivedClass;
		}
		case TYPE_DATE: {
			const revivedDate: Date = new Date($$v);

			cache.set($$r, revivedDate);

			return revivedDate;
		}
		case TYPE_SET: {
			const revivedSet: Set<TransformableOrJsonSerializableType> = new Set();

			cache.set($$r, revivedSet);

			for (const val of $$v) {
				revivedSet.add(transformFromSerialization(val, cache));
			}

			return revivedSet;
		}
		case TYPE_MAP: {
			const revivedMap: Map<
				TransformableOrJsonSerializableType,
				TransformableOrJsonSerializableType
			> = new Map();

			cache.set($$r, revivedMap);

			for (const [key, val] of $$v) {
				revivedMap.set(
					transformFromSerialization(key, cache),
					transformFromSerialization(val, cache),
				);
			}

			return revivedMap;
		}
		case TYPE_BIGINT: {
			const revivedBigInt: bigint = BigInt($$v);

			return revivedBigInt;
		}
		case TYPE_INFINITY: {
			const revivedInfinity: number = $$v === "+" ? Infinity : -Infinity;

			return revivedInfinity;
		}
		case TYPE_NAN: {
			const revivedNan: number = NaN;

			return revivedNan;
		}
		case TYPE_REFERENCE: {
			return cache.get($$v);
		}
		case TYPE_ARRAY: {
			const revivedArray: Array<TransformableOrJsonSerializableType> = [];

			cache.set($$r, revivedArray);

			for (const val of $$v) {
				revivedArray.push(transformFromSerialization(val, cache));
			}

			return revivedArray;
		}

		default: {
			// Plain o'l object
			const revivedObject: Record<string, TransformableOrJsonSerializableType> =
				{};

			cache.set($$r, revivedObject);

			for (const key in data) {
				if (key === "$$r") continue;

				revivedObject[key] = transformFromSerialization(
					(data as Record<string, JsonSerializableType>)[key],
					cache,
				);
			}

			return revivedObject;
		}
	}
};

const serialize = (obj: TransformableOrJsonSerializableType): string =>
	JSON.stringify(transformForSerialization(obj));

const deserialize = (str: string): TransformableOrJsonSerializableType =>
	transformFromSerialization(JSON.parse(str));

export { serialize, deserialize };
