import { defineConfig } from "bunup";

const ENTRY_GLOBS = [
	"src/**/*.ts",
	"!src/**/*.test.ts",
	"!src/_internal/**/*.ts",
	"!src/**/_*.ts",
];

const config = defineConfig([
	{
		dts: { splitting: true },
		entry: ENTRY_GLOBS,
		exports: true,
		format: ["esm", "cjs"],
		name: "regular",
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
