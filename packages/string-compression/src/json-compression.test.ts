import { describe, expect, it } from "vitest";
import {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
	isStringJsonObjectOrCompressedString,
} from "./json-compression";
import { STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION } from "./shared";
import "@stardazed/streams-polyfill";

describe("isStringJsonObjectOrCompressedString", () => {
	it("should return STRING_TYPE_JSON for JSON objects", () => {
		const jsonString = '{"key":"value"}';
		expect(isStringJsonObjectOrCompressedString(jsonString)).toBe(1);
	});

	it("should return STRING_TYPE_COMPRESSED for other strings", () => {
		const compressedString = "H4sIAAAAAAAAC/NIzcnJ11Eozy/KSQEAG/24nw8AAAA=";
		expect(isStringJsonObjectOrCompressedString(compressedString)).toBe(2);
	});
});

describe("decompressPossiblyCompressedJsonString", () => {
	it("should return the same string if it is a JSON object", async () => {
		const jsonString = '{"key":"value"}';
		const result = await decompressPossiblyCompressedJsonString(jsonString);
		expect(result).toBe(jsonString);
	});

	it("should decompress a compressed string", async () => {
		const originalString = "a".repeat(
			STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION + 1,
		);
		const compressedString = await compressStringIfApplicable(
			originalString,
			true,
		);
		const result =
			await decompressPossiblyCompressedJsonString(compressedString);
		expect(result).toBe(originalString);
	});
});

describe("compressStringIfApplicable", () => {
	it("should not compress a string smaller than the threshold", async () => {
		const shortString = "short string";
		const result = await compressStringIfApplicable(shortString, true);
		expect(result).toBe(shortString);
	});

	it("should compress a string larger than the threshold", async () => {
		const longString = "a".repeat(
			STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION + 1,
		);
		const result = await compressStringIfApplicable(longString, true);
		expect(result).not.toBe(longString);
	});

	it("should not compress if canCompressionOccur is false", async () => {
		const longString = "a".repeat(
			STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION + 1,
		);
		const result = await compressStringIfApplicable(longString, false);
		expect(result).toBe(longString);
	});
});
