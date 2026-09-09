# gal-arcade

The front door to Gal's browser games: one static `index.html`, no build step,
no dependencies. Deployed to gal-arcade.vercel.app. Each game it links to is a
separate repo with its own Vercel deployment.

The shelf itself is the `GAMES` array near the bottom of `index.html`; adding a
game means adding an entry there. See `README.md` for the field shapes and the
`shots/` folder rule.

## Agent skills

### Issue tracker

GitHub Issues on `galmadar/gal-arcade`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
