import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = resolve(__dirname, "examples");
const htmlFiles = readdirSync(root).filter((f) => f.endsWith(".html"));

const input: Record<string, string> = {};
for (const file of htmlFiles) {
	input[file.replace(".html", "")] = resolve(root, file);
}

export default defineConfig({
	root: "examples",
	publicDir: false,
	resolve: {
		alias: {
			"@grandscatter/core": resolve(__dirname, "src/index.ts"),
		},
	},
	test: {
		root: resolve(__dirname),
	},
	build: {
		target: "esnext",
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input,
		},
	},
});
