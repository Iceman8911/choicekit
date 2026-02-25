import type { TransformableOrJsonSerializableType } from "@packages/serializer";

export type GenericObject = Record<string, unknown>;
export type GenericSerializableObject = Record<
	string,
	TransformableOrJsonSerializableType
>;

export type MergeObjectTypes<
	TObjectA extends GenericObject,
	TObjectB extends GenericObject,
> = {
	[K in keyof TObjectA | keyof TObjectB]: K extends keyof TObjectB
		? TObjectB[K]
		: K extends keyof TObjectA
			? TObjectA[K]
			: never;
};
