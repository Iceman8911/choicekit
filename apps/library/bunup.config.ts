import { defineConfig } from "bunup";

const config = defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	noExternal: ["@packages/serializer", "@packages/string-compression"],
});

export default config as ReturnType<typeof defineConfig>;
