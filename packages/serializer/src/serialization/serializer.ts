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
 * Union type representing all possible transformed data types for serialization.
 */
type TransformedDataType =
	| TransformedClass
	| TransformedDate
	| TransformedSet
	| TransformedMap
	| TransformedInfinity
	| TransformedNan
	| TransformedBigInt;

type ClassConstructor = SugarBoxClassConstructor<unknown>;

// Don't alter pervious values else saves will be broken. I explicitly chose to use primitive constants since they minify better
const TYPE_CLASS = 1,
	TYPE_DATE = 2,
	TYPE_SET = 3,
	TYPE_MAP = 4,
	TYPE_BIGINT = 5,
	TYPE_INFINITY = 6,
	TYPE_NAN = 7;

const TRANSFORMED_DATA_TYPE_COMMON_KEY: keyof TransformedDataType = "$$t";

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

/** From deserialized to serialized! */
const transformForSerialization = (
	data: unknown,
): TransformedDataType | unknown => {
	if (data == null) {
		return data;
	}

	if (isArray(data)) {
		return data.map(transformForSerialization);
	}

	if (data instanceof Date) {
		const transformedDate: TransformedDate = {
			$$t: TYPE_DATE,
			$$v: data.getTime(),
		};

		return transformedDate;
	}

	if (data instanceof Map) {
		const transformedMap: TransformedMap = {
			$$t: TYPE_MAP,
			$$v: arrayFrom(data, ([k, v]) => [
				transformForSerialization(k),
				transformForSerialization(v),
			]),
		};

		return transformedMap;
	}

	if (data instanceof Set) {
		const transformedSet: TransformedSet = {
			$$t: TYPE_SET,
			$$v: arrayFrom(data, transformForSerialization),
		};

		return transformedSet;
	}

	if (typeof data === "bigint") {
		const transformedBigInt: TransformedBigInt = {
			$$t: TYPE_BIGINT,
			$$v: `${data}`,
		};

		return transformedBigInt;
	}

	if (typeof data === "number") {
		if (data === Infinity) {
			const transformedInfinity: TransformedInfinity = {
				$$t: TYPE_INFINITY,
				$$v: "+",
			};

			return transformedInfinity;
		}

		if (data === -Infinity) {
			const transformedInfinity: TransformedInfinity = {
				$$t: TYPE_INFINITY,
				$$v: "-",
			};

			return transformedInfinity;
		}

		if (Number.isNaN(data)) {
			const transformedNan: TransformedNan = { $$t: TYPE_NAN, $$v: "" };

			return transformedNan;
		}
	}

	// Check if this is a custom class instance
	for (const [classId, ClassConstructor] of classRegistry) {
		if (data instanceof ClassConstructor) {
			const serializedClass = transformForSerialization(data.toJSON());

			const transformedClass: TransformedClass = {
				$$t: TYPE_CLASS,
				$$v: {
					data: serializedClass,
					id: classId,
				},
			};

			return transformedClass;
		}
	}

	// Handle regular objects
	if (typeof data === "object") {
		return tranformObjPropsForSerialization(data);
	}

	return data;
};

/** From serialized to deserialized! */
const transformFromSerialization = (obj: unknown): unknown => {
	if (obj == null) {
		return obj;
	}

	if (isArray(obj)) {
		return obj.map(transformFromSerialization);
	}

	if (typeof obj === "object") {
		if (TRANSFORMED_DATA_TYPE_COMMON_KEY in obj) {
			//@ts-expect-error So we have typechecking on the possible discriminated union
			const { $$t, $$v }: TransformedDataType = obj;

			// Check if this is a serialized custom class
			if ($$t === TYPE_CLASS) {
				const classConstructor = classRegistry.get($$v.id);

				// Transform the data before passing to fromJSON to handle nested Maps/Sets
				const transformedData = transformFromSerialization($$v.data);
				return classConstructor?.fromJSON(transformedData);
			}

			if ($$t === TYPE_DATE) {
				return new Date($$v);
			}

			if ($$t === TYPE_SET) {
				return new Set($$v.map(transformFromSerialization));
			}

			if ($$t === TYPE_MAP) {
				return new Map(
					$$v.map(([k, v]) => [
						transformFromSerialization(k),
						transformFromSerialization(v),
					]),
				);
			}

			if ($$t === TYPE_BIGINT) {
				return BigInt($$v);
			}

			if ($$t === TYPE_INFINITY) {
				return $$v === "+" ? Infinity : -Infinity;
			}

			if ($$t === TYPE_NAN) {
				return NaN;
			}
		} else {
			// Handle regular objects
			const result: GenericObject = {};

			for (const key in obj) {
				//@ts-expect-error This is not an error
				result[key] = transformFromSerialization(obj[key]);
			}

			return result;
		}
	}

	return obj;
};

// Transform the object to handle custom classes and non-serializable types
const serialize = (obj: unknown): string =>
	JSON.stringify(transformForSerialization(obj));

// biome-ignore lint/suspicious/noExplicitAny: <Impractical to specify all types here>
const deserialize = (str: string): any =>
	transformFromSerialization(JSON.parse(str));

export { serialize, deserialize };
