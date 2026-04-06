import { describe, expect, it } from "bun:test";
import {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
	isStringJsonObjectOrCompressedString,
} from "./json-compression";
import { STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION } from "./shared";
import "@stardazed/streams-polyfill";

const buildLargeNoisyString = (length: number): string => {
	let seed = 0x89abcdef;
	let result = "";

	for (let i = 0; i < length; i++) {
		seed = (seed * 1103515245 + 12345) >>> 0;
		result += String.fromCharCode(32 + (seed % 95));
	}

	return result;
};

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

	it("should round-trip very large compressed strings", async () => {
		const originalString = buildLargeNoisyString(250_000);
		const compressedString = await compressStringIfApplicable(
			originalString,
			true,
		);
		const result =
			await decompressPossiblyCompressedJsonString(compressedString);

		expect(result).toBe(originalString);
	});
});
