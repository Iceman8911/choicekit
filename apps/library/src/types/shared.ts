import type { TransformableOrJsonSerializableType } from "@packages/serializer";

export type GenericObject = Record<string, unknown>;
export type GenericSerializableObject = Record<
	string,
	TransformableOrJsonSerializableType
>;
