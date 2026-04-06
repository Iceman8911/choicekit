import { describe, expect, it } from "bun:test";
import { compressString, decompressString } from "./compression";
import "@stardazed/streams-polyfill";

const buildLargeNoisyString = (length: number): string => {
	let seed = 0x12345678;
	let result = "";

	for (let i = 0; i < length; i++) {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		result += String.fromCharCode(32 + (seed % 95));
	}

	return result;
};

describe("compression", () => {
	it("should compress and decompress a string successfully", async () => {
		const originalString = "Hello, world! This is a test string.";
		const encoding = "gzip";

		const compressed = await compressString(originalString, encoding);
		const decompressed = await decompressString(compressed, encoding);

		expect(decompressed).toEqual(originalString);
	});

	it("should handle empty string", async () => {
		const originalString = "";
		const encoding = "gzip";

		const compressed = await compressString(originalString, encoding);
		const decompressed = await decompressString(compressed, encoding);

		expect(decompressed).toEqual(originalString);
	});

	it("should handle various unicode characters", async () => {
		const originalString =
			"你好, ప్రపంచం! This is a test with unicode characters. こんにちは世界. 👋";
		const encoding = "gzip";

		const compressed = await compressString(originalString, encoding);
		const decompressed = await decompressString(compressed, encoding);

		expect(decompressed).toEqual(originalString);
	});

	it("should round-trip very large strings without range errors", async () => {
		const originalString = buildLargeNoisyString(250_000);
		const encoding = "gzip";

		const compressed = await compressString(originalString, encoding);
		const decompressed = await decompressString(compressed, encoding);

		expect(decompressed).toBe(originalString);
	});
});
