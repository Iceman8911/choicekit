import { defineConfig } from "bunup";

const config = defineConfig({
	entry: ["src/*.ts", "src/plugins/**/*.ts", "!src/plugins/**/*.test.ts"],
	exports: true,
	format: ["esm", "cjs"],
	packages: "bundle",
	target: "browser",
});

export default config as ReturnType<typeof defineConfig>;
