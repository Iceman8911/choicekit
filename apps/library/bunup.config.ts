import { defineConfig } from "bunup";

const ENTRY_GLOBS = [
	"src/**/index.ts",
	// Ignore the root index which only re-exports from submodules, to avoid generating an extra entry point with no unique exports.
	"!src/index.ts",
];

const config = defineConfig([
	{
		dts: { splitting: true },
		entry: ENTRY_GLOBS,
		exports: true,
		format: ["esm", "cjs"],
		name: "regular",
		packages: "bundle",
		report: { brotli: true, gzip: true },
		sourceBase: "./src/",
		target: "browser",
	},
	{
		clean: false,
		dts: { splitting: true },
		entry: ENTRY_GLOBS,
		format: "esm",
		minify: true,
		name: "minified",
		outDir: "dist/min",
		packages: "bundle",
		report: { brotli: true, gzip: true },
		sourcemap: "linked",
		target: "browser",
	},
]);

export default config as ReturnType<typeof defineConfig>;
