import { withSolidBase } from "@kobalte/solidbase/config";
import { defineConfig } from "@solidjs/start/config";

import referencePrerenderRoutes from "./src/generated/reference-prerender-routes.json";

export default defineConfig(
	withSolidBase(
		// SolidStart config
		{
			server: {
				baseURL: "/sugarbox",
				prerender: {
					crawlLinks: true,
					// Generated from TypeDoc JSON so `/reference/all` and exported `/reference/id/:id`
					// pages are prerendered like the rest of the site.
					routes: referencePrerenderRoutes,
				},
			},
		},
		// SolidBase config
		{
			description:
				"Twine SugarCube-inspired headless interactive fiction library.",

			editPath: "https://github.com/Iceman8911/sugarbox/edit/main/docs/:path",
			issueAutolink: "https://github.com/Iceman8911/sugarbox/issues/:issue",
			themeConfig: {
				nav: [
					{ link: "/guide", text: "Guide" },
					{ link: "/reference", text: "Reference" },
				],
				sidebar: {
					"/guide": [
						{
							collapsed: false,
							items: [
								{
									link: "/",
									title: "Introduction",
								},
								{
									link: "/about",
									title: "About",
								},
							],
							title: "Getting Started",
						},
						{
							base: "/sugarbox",
							collapsed: false,
							items: [
								{
									link: "/",
									title: "Overview",
								},
								{
									link: "/passage",
									title: "Passages and Navigation",
								},
								{
									link: "/state",
									title: "State and History",
								},
								{
									link: "/save",
									title: "Saving and Loading",
								},
								{
									link: "/migration",
									title: "Save Migration",
								},
								{
									link: "/event",
									title: "Events",
								},
								{
									link: "/adapter",
									title: "Adapters",
								},
								{
									link: "/config",
									title: "Engine Configuration",
								},

								{
									link: "/prng",
									title: "PRNG",
								},
								{
									link: "/typescript",
									title: "Typescript",
								},
								{
									link: "/classes",
									title: "Custom Classes",
								},
								{
									link: "/storylets",
									title: "Storylets",
								},
								// TODO: implement Storylets docs page
							],
							title: "Sugarbox",
						},
					],
				},
				socialLinks: { github: "https://github.com/Iceman8911/sugarbox" },
			},
			title: "Sugarbox",
			titleTemplate: ":title - Sugarbox",
		},
	),
);
