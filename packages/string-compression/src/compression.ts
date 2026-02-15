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

	return btoa(String.fromCharCode(...compressedBuffer));
}

/**
 * Decompress a base64 string representation with browser native APIs in to a normal js string
 */
export async function decompressString(
	base64: string,
	encoding: CompressionFormat,
): Promise<string> {
	const binaryString = atob(base64);

	const compressedBytes = Uint8Array.from(binaryString, (char) =>
		char.charCodeAt(0),
	);

	const decompressedStream = new Blob([compressedBytes])
		.stream()
		.pipeThrough(new DecompressionStream(encoding));

	return new Response(decompressedStream).text();
}
