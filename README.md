# Gal's Arcade

The front door to the small browser games I'm building. One page, one list, a
card per game linking out to that game's own site.

Live at **https://gal-arcade.vercel.app**

## How it works

It's a single `index.html`. No build step, no dependencies, no framework — open
the file and it works, the same as the deployed page.

## Adding a game

Add one entry to the `GAMES` array near the bottom of `index.html`:

```js
{
  id: 'rail-yard',
  name: 'Rail Yard',
  blurb: 'One line about it.',
  play: 'https://rail-yard.vercel.app',
  source: 'https://github.com/galmadar/rail-yard',
  shot: 'shots/rail-yard.png',   // leave '' for a "screenshot coming" placeholder
  live: true,                    // false hides it completely
  building: true,                // true shows a "still building" badge
}
```

`live: false` is for a game that isn't published yet — it stays off the shelf
until there's something to click.

## Screenshots

Drop a 16:9 image in `shots/` and point `shot` at it. **Don't call that folder
`public/`** — Vercel would then serve only that folder and the site would 404.
