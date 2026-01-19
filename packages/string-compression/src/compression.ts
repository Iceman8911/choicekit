import { SHARED_UTF8_TEXT_ENCODER } from "./shared";

/** This redundant identifier will be removed in all compressed strings and be reattached during decompression */
const BASE64_IDENTIFIER = "data:application/octet-stream;base64,";

/**
 * Compress a string with browser native APIs into a base64 string
 */
export async function compressString(
	data: string,
	encoding: CompressionFormat,
): Promise<string> {
	const inputBuffer = SHARED_UTF8_TEXT_ENCODER.encode(data);

	const compressedStream = new ReadableStream({
		start(controller) {
			controller.enqueue(inputBuffer);
			controller.close();
		},
	}).pipeThrough(new CompressionStream(encoding));

	const compressedBlob = await new Response(compressedStream).blob();

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const res = `${reader.result}`;

			// Skip the redundant identifier
			const base64 = `${res.split(",")[1]}`;

			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(compressedBlob);
	});
}

/**
 * Decompress a base64 string representation with browser native APIs in to a normal js string
 */
export async function decompressString(
	base64: string,
	encoding: CompressionFormat,
): Promise<string> {
	// Convert Base64 to a data URL and fetch it to get a blob
	const resp = await fetch(`${BASE64_IDENTIFIER}${base64}`);
	const blob = await resp.blob();

	const decompressedStream = blob
		.stream()
		.pipeThrough(new DecompressionStream(encoding));

	return await new Response(decompressedStream).text();
}
