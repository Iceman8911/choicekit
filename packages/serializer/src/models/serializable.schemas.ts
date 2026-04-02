import * as v from "valibot";

import type { TransformableOrJsonSerializableType } from "../serialization/serializer";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	if (
		!v.is(
			v.objectWithRest(
				{},
				v.lazy(() => TransformableOrJsonSerializableSchema),
			),
			value,
		)
	) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

const isPlainRecord = (
	value: unknown,
): value is TransformableOrJsonSerializableType => {
	if (!isPlainObject(value)) {
		return false;
	}

	return v.is(
		v.record(
			v.string(),
			v.lazy(() => TransformableOrJsonSerializableSchema),
		),
		value,
	);
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
		v.array(v.lazy(() => TransformableOrJsonSerializableSchema)),
		v.custom<TransformableOrJsonSerializableType>(isPlainRecord),
		v.date(),
		v.map(
			v.lazy(() => TransformableOrJsonSerializableSchema),
			v.lazy(() => TransformableOrJsonSerializableSchema),
		),
		v.set(v.lazy(() => TransformableOrJsonSerializableSchema)),
		v.bigint(),
		v.custom<TransformableOrJsonSerializableType>(isCustomClassInstance),
	]);
