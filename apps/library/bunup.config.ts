import { defineConfig } from "bunup";

const config = defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	noExternal: [
		"@packages/serializer",
		"@packages/string-compression",
		"@packages/polyfills",
	],
});

export default config as ReturnType<typeof defineConfig>;
