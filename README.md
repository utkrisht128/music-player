# Resonate — personal music player

A Spotify-inspired music player for personal, non-commercial use. React 18 +
React Router, no UI framework, no backend.

## Running it

```bash
npm install
npm start        # http://localhost:3000
npm test         # smoke tests
npm run build    # production bundle in build/
```

## Where the music comes from

The catalogue is the set of audio files under `src/music`, described in
[`src/data/catalog.js`](src/data/catalog.js). Nothing is scraped, proxied or
fetched from a streaming service. The **Local files** page also plays audio you
pick from your own device; those files never leave the browser.

### Swapping in a different provider

`src/services/musicService.js` is the only seam between the UI and whatever
supplies music. Pages import that module and nothing below it.

To use a licensed API instead, write a module with the same methods as
[`src/services/providers/localCatalogProvider.js`](src/services/providers/localCatalogProvider.js)
and call `setProvider(yourProvider)` at startup. No page or component changes.

> **Credentials never go in this app.** Everything under `src/` is compiled
> into a bundle any visitor can read, and `REACT_APP_*` env vars are inlined at
> build time — they are not secret. If a provider needs a client secret, put it
> in a small backend that holds the credential and exposes only the endpoints
> your provider module calls.

## Architecture

```
UI (pages / components)
  ↓
state (PlayerContext, LibraryContext, UIContext)
  ↓
services/musicService      audio/AudioManager
  ↓                          ↓
provider                   HTMLAudioElement
```

| Path | Responsibility |
|---|---|
| `audio/AudioManager.js` | Sole owner of the audio element. Emits events; no React. |
| `state/PlayerContext` | Queue, shuffle, repeat, transport, reload persistence |
| `state/LibraryContext` | Playlists, liked songs, play history (all persisted) |
| `state/UIContext` | Toasts, the one context menu, the modal stack |
| `services/` | Provider seam — the only place a data source is known |
| `components/`, `pages/` | Presentation |
| `styles/` | `tokens.css` first; everything else reads its variables |

Two rules keep this honest:

- **Only `AudioManager` touches an audio element.** Playback is driven by
  intent (`isPlaying`) through one effect, so the UI can never claim to be
  playing while the element sits paused.
- **Only track *ids* are persisted**, never whole track objects — bundled file
  URLs change hash on every build, so stored copies would rot.

## Storage

State lives in `localStorage` under the `mp:` prefix: `playlists`, `liked`,
`recent`, `player`, `durations`. Every read and write is guarded, so private
mode or a full quota degrades to "nothing persists" rather than a crash.

On reload the queue, volume, shuffle and repeat mode are restored, but
**playback does not auto-resume** — browsers block audio no user gesture asked
for, and a UI showing "playing" over silence would be lying.

Durations are read from each file's own metadata (probed lazily, four at a
time, then cached) rather than hardcoded. A track whose duration is not yet
known shows `-:--`, never a placeholder `0:00`.

## Keyboard

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `Space` | Play / pause | | `M` | Mute |
| `←` `→` | Seek 5s | | `S` | Shuffle |
| `Shift+←` `→` | Previous / next | | `R` | Repeat |
| `↑` `↓` | Volume | | `L` | Like |

Shortcuts are inert while typing in a field or when a browser modifier is held.

## Known limitations

- Local device files cannot survive a reload (object URLs die with the page),
  so they are excluded from the persisted queue rather than restored broken.
- Local file metadata is read from the **filename**; ID3 tags are not parsed.
- "Popular" and "Made for you" are derived from this catalogue and your own
  play history. They are not a claim about anyone else's listening.
- Reordering the queue and playlists uses move up/down buttons, not drag and
  drop, so it stays operable by keyboard.

## Licensing note

The audio files in `src/music` are commercial recordings included in this
repository. This project is for personal use only. Do not deploy it publicly or
redistribute those files without the rights to do so — point the provider seam
at a licensed source instead.
