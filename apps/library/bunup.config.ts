import { defineConfig } from "bunup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	noExternal: ["@packages/serializer", "@packages/string-compression"],
});
