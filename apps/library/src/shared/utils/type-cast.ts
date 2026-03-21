import type { ReadonlyDeep } from "type-fest";

export function makeReadonly<TData>(data: TData): ReadonlyDeep<TData> {
	//@ts-expect-error type-cast
	return data;
}
