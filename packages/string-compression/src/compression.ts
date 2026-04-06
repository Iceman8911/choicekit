const BINARY_STRING_CHUNK_SIZE = 0x8000;

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
	const binaryParts: string[] = [];

	for (let i = 0; i < bytes.length; i += BINARY_STRING_CHUNK_SIZE) {
		binaryParts.push(
			String.fromCharCode(...bytes.subarray(i, i + BINARY_STRING_CHUNK_SIZE)),
		);
	}

	return btoa(binaryParts.join(""));
};

/**
 * Compress a string with browser native APIs into a base64 string
 */
export async function compressString(
	data: string,
	encoding: CompressionFormat,
): Promise<string> {
	const compressedStream = new Blob([data])
		.stream()
		.pipeThrough(new CompressionStream(encoding));

	const compressedBuffer = new Uint8Array(
		await new Response(compressedStream).arrayBuffer(),
	);

	return uint8ArrayToBase64(compressedBuffer);
}

/**
 * Decompress a base64 string representation with browser native APIs in to a normal js string
 */
export async function decompressString(
	base64: string,
	encoding: CompressionFormat,
): Promise<string> {
	const binaryString = atob(base64);
	const compressedBytes = new Uint8Array(binaryString.length);

	for (let i = 0; i < binaryString.length; i++) {
		compressedBytes[i] = binaryString.charCodeAt(i);
	}

	const decompressedStream = new Blob([compressedBytes])
		.stream()
		.pipeThrough(new DecompressionStream(encoding));

	return new Response(decompressedStream).text();
}
