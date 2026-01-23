// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site:"https://iceman8911.github.io/sugarbox/" ,
	integrations: [
		starlight({
			title: 'Sugarbox Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/iceman8911/sugarbox' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', link: 'guides' },
						{
							link: "guides/about",
							label: "About",
						},
					],
        },
        {
          label: "SugarBox",
          autogenerate:{directory:"guides/sugarbox",}
				},
				// {
				// 	label: 'Reference',
				// 	autogenerate: { directory: 'reference' },
				// },
			],
		}),
	],
});
