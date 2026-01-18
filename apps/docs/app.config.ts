import { withSolidBase } from "@kobalte/solidbase/config";
import { defineConfig } from "@solidjs/start/config";

export default defineConfig(
	withSolidBase(
		// SolidStart config
		{
			server: {
				prerender: {
					crawlLinks: true,
				},
			},
		},
		// SolidBase config
		{
			description:
				"Twine Sugarcube-inspired headless interative fiction library.",

			editPath: "https://github.com/Iceman8911/sugarbox/edit/main/docs/:path",
			issueAutolink: "https://github.com/Iceman8911/sugarbox/issues/:issue",
			themeConfig: {
				sidebar: {
					"/": {
						items: [
							{
								collapsed: false,
								items: [
									{
										link: "/",
										title: "Home",
									},
									{
										link: "/about",
										title: "About",
									},
								],
								title: "Overview",
							},
						],
					},
				},
			},
			title: "Sugarbox",
			titleTemplate: ":title - SolidBase",
		},
	),
);
