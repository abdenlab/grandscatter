import { defineConfig } from "vite";
import { resolve } from "path";

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
