import { SHARED_UTF8_TEXT_ENCODER } from "./shared";

function uint8ArrayToBase64(buffer: Uint8Array) {
	let binaryString = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binaryString += String.fromCharCode(bytes[i] ?? 0);
	}
	return btoa(binaryString);
}

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

	const compressedBuffer = await new Response(compressedStream).bytes();

	return uint8ArrayToBase64(compressedBuffer);
}

/**
 * Decompress a base64 string representation with browser native APIs in to a normal js string
 */
export async function decompressString(
	base64: string,
	encoding: CompressionFormat,
): Promise<string> {
	const compressedBuffer = Uint8Array.fromBase64(base64);

	const decompressedStream = new Blob([compressedBuffer])
		.stream()
		.pipeThrough(new DecompressionStream(encoding));

	return new Response(decompressedStream).text();
}
