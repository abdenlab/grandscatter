import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"@anyscatter/core": resolve(__dirname, "src/index.ts"),
		},
	},
	server: {
		open: "/example/",
	},
});
