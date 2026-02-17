import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"@grandscatter/core": resolve(__dirname, "src/index.ts"),
		},
	},
	server: {
		open: "/examples/",
	},
});
