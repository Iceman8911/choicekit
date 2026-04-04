import { defineConfig } from "bunup";

const ENTRY_FILES = [
	"src/plugins/index.ts",
	"src/engine/index.ts",
	"src/adapters/index.ts",
];

const config = defineConfig([
	{
		dts: { splitting: true },
		entry: ENTRY_FILES,
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
		entry: ENTRY_FILES,
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
