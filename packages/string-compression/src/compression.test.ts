import { describe, expect, it } from "vitest";
import { compressString, decompressString } from "./compression";
import "@stardazed/streams-polyfill";

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
});
