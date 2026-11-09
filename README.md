# portfolio

Khalil Peguero's portfolio, live at [khalilpeguero.me/portfolio](https://khalilpeguero.me/portfolio/).

It's one static page with no build step. Open `index.html` in a browser to run it locally.

- `index.html` holds all the content.
- `css/site.css` is the styling.
- `js/site.js` runs the swarm, the physics blocks and the floor that drops them when you scroll, the project windows, the agent skills file tree and the contact form.
- `js/vendor/matter.min.js` is [matter.js](https://brm.io/matter-js/) 0.20.0 (MIT), the physics engine.
- `data/prs.js` lists every PR merged into [Swarms](https://github.com/kyegomez/swarms) and its [docs](https://github.com/The-Swarm-Corporation/swarms-framework-docs). Each one becomes a block in the hero.
- `og.png` is the link-preview image. `scripts/og-image.html` is its source, and the command to rebuild it is at the top of that file.
- `llms.txt` is the page's content in Markdown, for agents. The refresh job updates its PR count along with `data/prs.js`.

## Refreshing the PR data

`.github/workflows/refresh-prs.yml` runs on Mondays and Thursdays and can also be started from the Actions tab. It rewrites `data/prs.js` and the PR count in `llms.txt`, commits them if anything changed, and starts `.github/workflows/pages.yml`, which deploys the site. That workflow also deploys every push to `main`, so Settings > Pages > Source must be "GitHub Actions".

To refresh by hand:

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/fetch-prs.mjs
```

## Checking a change

`scripts/measure.mjs` measures what a change must not make worse: when the name is first visible, the readout under the hero, sideways scroll at 320, 390 and 1440 wide, page errors, and how far a visitor scrolls to reach Experience. The comment at the top of the file shows how to start Chrome and a local server for it. Run it on `main` and on your branch and compare.

Lighthouse covers the scores:

```sh
npx lighthouse http://127.0.0.1:8765/ --port=9333 --only-categories=performance,accessibility,best-practices,seo
```

Lighthouse audits whichever color scheme the browser reports, so a Mac in dark mode gets a dark-mode audit. Add `--blink-settings=preferredColorScheme=1` to the Chrome command to force light. Lighthouse also sees only what's on screen when its audit runs, and the hero's blocks may or may not have landed by then, so the accessibility score can change between runs. For a full contrast check in either scheme, scroll the page and run axe-core in it.
