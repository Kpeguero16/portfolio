# portfolio

Khalil Peguero's portfolio, live at [khalilpeguero.me/portfolio](https://khalilpeguero.me/portfolio/).

It's one static page with no build step. Open `index.html` in a browser to run it locally.

- `index.html` holds all the content.
- `css/site.css` is the styling.
- `js/site.js` runs the swarm, the physics blocks, the rising terminal, the project windows and the contact form.
- `js/vendor/matter.min.js` is [matter.js](https://brm.io/matter-js/) 0.20.0 (MIT), the physics engine.
- `data/prs.js` lists every PR merged into [Swarms](https://github.com/kyegomez/swarms) and its [docs](https://github.com/The-Swarm-Corporation/swarms-framework-docs). Each one becomes a block in the hero.
- `og.png` is the link-preview image. `scripts/og-image.html` is its source, and the command to rebuild it is at the top of that file.
- `llms.txt` is the page's content in Markdown, for agents. Its PR count is dated, so it doesn't need the refresh job.

## Refreshing the PR data

`.github/workflows/refresh-prs.yml` runs on Mondays and Thursdays and can also be started from the Actions tab. It rewrites `data/prs.js`, commits it if anything changed, and requests a Pages build.

To refresh by hand:

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/fetch-prs.mjs
```
