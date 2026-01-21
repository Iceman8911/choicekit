import {
	deserialize,
	serialize,
	type TransformableOrJsonSerializableType,
} from "./serializer";

/** General purpose cloning helper using custom serializer for class support
 */
function clone<TData extends TransformableOrJsonSerializableType>(
	val: TData,
): TData {
	try {
		//@ts-expect-error Use our custom serializer that handles classes properly
		return deserialize(serialize(val));
	} catch {
		return structuredClone(val);
	}
}

export { clone };
