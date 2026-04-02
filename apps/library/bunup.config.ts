import { defineConfig } from "bunup";

const ENTRY_GLOBS = [
	"src/*.ts",
	"src/plugins/**/*.ts",
	"!src/plugins/**/*.test.ts",
];

const config = defineConfig([
	{
		entry: ENTRY_GLOBS,
		exports: true,
		format: ["esm", "cjs"],
		name: "regular",
		report: { brotli: true, gzip: true },
		target: "browser",
	},
	{
		clean: false,
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
