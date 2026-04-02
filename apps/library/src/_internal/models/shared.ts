import type { TransformableOrJsonSerializableType } from "@packages/serializer";

export type GenericObject = Record<string, unknown>;
export type GenericSerializableObject = Record<
	string,
	TransformableOrJsonSerializableType
>;

type WidenPrimitive<T> = T extends true | false
	? boolean
	: T extends number
		? number
		: T extends string
			? string
			: T extends bigint
				? bigint
				: T extends symbol
					? symbol
					: T;

type WidenArray<T> = Array<WidenAndMutable<T>>;

type WidenAndMutable<T> =
	// keep functions as-is
	T extends (...args: any[]) => any
		? T
		: // arrays / tuples (readonly or not)
			T extends readonly (infer U)[]
			? WidenArray<U>
			: // ReadonlyMap / Map -> mutable Map with widened key/value
				T extends ReadonlyMap<infer K, infer V>
				? Map<WidenAndMutable<K>, WidenAndMutable<V>>
				: // ReadonlySet / Set -> mutable Set with widened element
					T extends ReadonlySet<infer U2>
					? Set<WidenAndMutable<U2>>
					: // objects -> remove readonly and recurse
						T extends object
						? { -readonly [K in keyof T]: WidenAndMutable<T[K]> }
						: // primitives / literals
							WidenPrimitive<T>;

/** Convert stuff like `0` -> `number` */
export type ExpandType<T> = WidenAndMutable<T>;
