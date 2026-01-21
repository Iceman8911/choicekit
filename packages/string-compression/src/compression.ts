import { SHARED_UTF8_TEXT_ENCODER } from "./shared";

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

	const chunks: Uint8Array[] = [];
	const compressedStreamReader = compressedStream.getReader();

	while (true) {
		const { done, value } = await compressedStreamReader.read();
		if (done) break;
		chunks.push(value);
	}

	// Concatenate all chunks into one Uint8Array
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result.toBase64();
}

/**
 * Decompress a base64 string representation with browser native APIs in to a normal js string
 */
export async function decompressString(
	base64: string,
	encoding: CompressionFormat,
): Promise<string> {
	const compressedBuffer = Uint8Array.fromBase64(base64);

	const blob = new Blob([compressedBuffer]);

	const decompressedStream = blob
		.stream()
		.pipeThrough(new DecompressionStream(encoding));

	return await new Response(decompressedStream).text();
}
