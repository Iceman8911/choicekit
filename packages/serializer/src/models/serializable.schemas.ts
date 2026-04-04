import * as v from "valibot";
import type { TransformableOrJsonSerializableType } from "../serialization/serializer";

const LazyTransformableOrJsonSerializableSchema: v.LazySchema<
	typeof TransformableOrJsonSerializableSchema
> = v.lazy(() => TransformableOrJsonSerializableSchema);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	if (
		!v.is(
			v.record(v.string(), LazyTransformableOrJsonSerializableSchema),
			value,
		)
	) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

const isCustomClassInstance = (
	value: unknown,
): value is TransformableOrJsonSerializableType => {
	if (
		!v.is(v.object({ constructor: v.function(), toJSON: v.function() }), value)
	) {
		return false;
	}

	const constructorValue = value.constructor as {
		classId?: unknown;
		fromJSON?: unknown;
	};

	return (
		v.is(v.string(), constructorValue.classId) &&
		v.is(v.function(), constructorValue.fromJSON)
	);
};

export const TransformableOrJsonSerializableSchema: v.GenericSchema<TransformableOrJsonSerializableType> =
	v.union([
		v.number(),
		v.string(),
		v.boolean(),
		v.null(),
		v.undefined(),
		v.array(LazyTransformableOrJsonSerializableSchema),
		v.custom<TransformableOrJsonSerializableType>(isPlainObject),
		v.date(),
		v.map(
			LazyTransformableOrJsonSerializableSchema,
			LazyTransformableOrJsonSerializableSchema,
		),
		v.set(LazyTransformableOrJsonSerializableSchema),
		v.bigint(),
		v.custom<TransformableOrJsonSerializableType>(isCustomClassInstance),
	]);
