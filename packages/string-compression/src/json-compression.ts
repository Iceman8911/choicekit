import { compress, decompress } from "@zalari/string-compression-utils";

// TODO: Add tests to ensure compression only happens when it'll be useful
const STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION = 1024;

/** Changing this will BREAK saves */
const SAVE_COMPRESSION_FORMAT = "gzip" satisfies CompressionFormat;

const encoder = new TextEncoder();

const STRING_TYPE_JSON = 1;
const STRING_TYPE_COMPRESSED = 2;
type STRING_TYPE = typeof STRING_TYPE_JSON | typeof STRING_TYPE_COMPRESSED;

const isStringJsonObjectOrCompressedString = (
	stringifiedValue: string,
): STRING_TYPE =>
	stringifiedValue.startsWith('{"') ? STRING_TYPE_JSON : STRING_TYPE_COMPRESSED;

export { isStringJsonObjectOrCompressedString };

const decompressPossiblyCompressedJsonString = async (
	possiblyCompressedString: string,
): Promise<string> =>
	isStringJsonObjectOrCompressedString(possiblyCompressedString) ===
	STRING_TYPE_JSON
		? possiblyCompressedString
		: decompress(possiblyCompressedString, SAVE_COMPRESSION_FORMAT);

const compressStringIfApplicable = async (
	strToMaybeCompress: string,
	canCompressionOccur: boolean,
): Promise<string> =>
	canCompressionOccur &&
	encoder.encode(strToMaybeCompress).length >
		STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION
		? compress(strToMaybeCompress, SAVE_COMPRESSION_FORMAT)
		: strToMaybeCompress;

export {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
	compress as compressString,
	decompress as decompressString,
};
