import { compressString, decompressString } from "./compression";
import {
	SAVE_COMPRESSION_FORMAT,
	SHARED_UTF8_TEXT_ENCODER,
	STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION,
} from "./shared";

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
		: decompressString(possiblyCompressedString, SAVE_COMPRESSION_FORMAT);

const compressStringIfApplicable = async (
	strToMaybeCompress: string,
	canCompressionOccur: boolean,
): Promise<string> =>
	canCompressionOccur &&
	SHARED_UTF8_TEXT_ENCODER.encode(strToMaybeCompress).length >
		STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION
		? compressString(strToMaybeCompress, SAVE_COMPRESSION_FORMAT)
		: strToMaybeCompress;

export {
	compressStringIfApplicable,
	decompressPossiblyCompressedJsonString,
	compressString,
	decompressString,
};
