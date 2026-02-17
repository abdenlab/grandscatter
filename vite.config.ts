import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { defineConfig } from "vite";

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
	build: {
		target: "esnext",
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input,
		},
	},
});
