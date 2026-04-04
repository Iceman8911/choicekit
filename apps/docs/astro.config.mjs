// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { viewTransitions } from "astro-vtbot/starlight-view-transitions";

// https://astro.build/config
export default defineConfig({
	base: "/Choicekit",
	site: "https://iceman8911.github.io/",
	integrations: [
		starlight({
			plugins: [viewTransitions()],
			title: "Choicekit Docs",
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/iceman8911/Choicekit",
				},
			],
			sidebar: [
				{
					label: "Getting Started",
					items: [
						{ label: "Introduction", link: "guides" },
						{
							link: "guides/about",
							label: "About",
						},
					],
				},
				{
					label: "Choicekit",
					autogenerate: { directory: "guides/Choicekit" },
				},
				{
					label: "Reference",
					items: [
						{ label: "Overview", link: "reference" },
						{ label: "All", link: "reference/all" },
					],
				},
			],
		}),
	],
});
