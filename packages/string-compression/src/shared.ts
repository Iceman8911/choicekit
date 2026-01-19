// TODO: Add tests to ensure compression only happens when it'll be useful
export const STRING_SIZE_MIN_THRESHOLD_FOR_COMPRESSION = 1024;

/** Changing this will BREAK saves */
export const SAVE_COMPRESSION_FORMAT = "gzip" satisfies CompressionFormat;

export const SHARED_UTF8_TEXT_ENCODER = new TextEncoder();
