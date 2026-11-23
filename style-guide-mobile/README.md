# The Ultimate Style Guide — mobile app

React Native (Expo SDK 58, TypeScript strict, Expo Router) app for Android and iPhone, built from
[`docs/SPEC.pdf`](docs/SPEC.pdf). It reuses the web version's real photos, try-on layers, content
and backend (`khemkaran14/styleguideforwomen`). Nothing is drawn: every look, piece and model is a
real photo, and every recolour, swap and body-type change edits that same photo on the GPU.

## Quick start

```bash
npm install
```

```bash
npm run resources   # puts the web app into resources/ (read-only reference)
```

```bash
npm run content     # resources JS -> src/content/*.json, photos -> src/assets/
```

```bash
npm test && npm run typecheck
```

```bash
npx eas-cli@latest build --profile development --platform android
```

Skia, MMKV and the other native modules need a development build (not Expo Go). Set the backend
with `EXPO_PUBLIC_API_URL` (default `https://style.livelifetricks.com`, see `eas.json`).

## Layout

| Path | What |
| --- | --- |
| `app/` | Expo Router screens: 5 tabs (Discover, Lookbook, Dressing Room, Saved, Profile), look/occasion detail, quiz, colours, rules, auth, admin |
| `src/content/` | Generated JSON + `images.ts` registry (never hand-edited) |
| `src/assets/` | 47 look photos, 46 part maps, base photo + mask, 108 pieces × image + mask (byte-for-byte copies, masks lossless) |
| `src/engine/` | Dressing Room maths ported from `ui3.js`: recolour, layering, effective masks, Lab flood fill, body warp, hit-testing, prompts; `shaders.ts` (SkSL) + `gpu.ts` run it on Skia |
| `src/store/` | zustand stores persisted with MMKV: Dressing Room, hearts, styled looks, account |
| `src/api/` | typed backend client (Bearer token in SecureStore) + react-query hooks |
| `src/ui/` | design system: tokens (light/dark), Bodoni Moda / Manrope / DM Mono, buttons, chips, PhotoCard, Swatch, toast… |
| `tools/` | `extract-content.ts`, `copy-assets.ts`, `make_variant.py`, `make_lookparts.py`, `web-reference.ts` |
| `backend/` | the `server.js` bearer-token change + tests, to apply in the web repo |
| `.maestro/` | end-to-end flows |

## Adding looks and pieces (data only)

- **New try-on piece:** generate the edit in Gemini/ChatGPT from the prompt pack, then
  `python tools/make_variant.py --base model.png --edit edited.png --id b-jeans-grey --cat bottom --name "Grey jeans" --desc "grey straight-leg jeans"`
  and `npm run content`.
- **New look photo:** add it to `resources/new-looks/looks.json` + `<id>.webp`, run
  `python tools/make_lookparts.py --id <id> --photo resources/new-looks/<id>.webp`, then `npm run content`.
- **Real body-type photos:** put `base-<type>.webp` and `base-<type>-mask.png` in `resources/body-types/`
  and run `npm run content`; the Dressing Room then uses that photo for the body type instead of the warp.
- The two pack-2 pieces with no photo yet (flat tan sandals, charm bracelet) stay hidden until added.

## Tests

`npm test` runs 18 Jest tests:

- **Content:** 47 looks (20/16/11), 16 occasions, 12 combos, 6 rules, 108 pieces in 13 categories, and every file exists.
- **Browsing:** the search "silk wedding" needs both words; the quiz answers Wedding / Traditional / Elegant put Banarasi or Kanjeevaram in the top 4; hidden looks drop out.
- **Golden test:** the app's recolour pipeline is compared with the web's own `recolour()`, loaded verbatim from `ui3.js`. "bottom = #1F2A55", and swaps plus three recolours, each have a mean pixel difference under 2.
- **Pieces and looks:** all 108 pieces render; every look photo has a selectable region; group and single selection work; the flood fill works.
- **Body type:** the warp matches the web's `bodyWarp()` and the feet stay in frame for petite and tall.
- **Prompts:** "blue jeans + chandbali + navy" lists all three changes in layer order.

`backend/test/bearer.test.js` runs 6 tests for the server change.
