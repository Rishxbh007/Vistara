# Advertisement Library

This folder **is** the ad library. Anything you drop in here becomes an advertisement
that Vistara can play before a video. There is no database row to insert, no code to
edit, and no restart required.

---

## 1. Where to put ad files

Put the video file directly in this folder:

```
video streaming platform/
└── ads/
    ├── vistara-premium.mp4      <-- an ad
    ├── cloudnine-hosting.mp4    <-- an ad
    ├── aperture-coffee.mp4      <-- an ad
    ├── ads.config.json          (optional metadata — not an ad)
    └── README.md                (this file — not an ad)
```

Copy a file in and it is live on the next page load. Delete a file and it stops being
served. Non-video files in this folder (like `ads.config.json` and `README.md`) are
ignored.

## 2. Supported formats

| Extension | Container | Notes |
|---|---|---|
| `.mp4`, `.m4v` | MP4 / H.264 + AAC | **Recommended.** Plays in every browser. |
| `.webm` | WebM / VP8-VP9 | Plays in Chrome, Edge, Firefox. |
| `.ogv`, `.ogg` | Ogg / Theora | Legacy Firefox. Avoid for new ads. |

Practical guidance for an ad that actually plays smoothly:

- **Codec:** H.264 video + AAC audio in an `.mp4` container.
- **Resolution:** 1280×720 is plenty. The player scales it to fit.
- **Length:** 5–30 seconds. The Skip button unlocks after `AD_SKIP_SECONDS` (default 5).
- **Size:** keep it small — a few MB. Ads are streamed with HTTP range requests, but a
  100 MB ad still makes the viewer wait.
- **Faststart:** encode with `-movflags +faststart` so the `moov` atom sits at the front
  of the file and playback can begin before the whole file downloads.

A known-good ffmpeg command for converting an existing clip into an ad:

```
ffmpeg -i my-raw-ad.mov -c:v libx264 -profile:v main -crf 23 -pix_fmt yuv420p ^
       -c:a aac -b:a 128k -movflags +faststart ads/my-ad.mp4
```

> ⚠️ The ad is played **muted at first** because every modern browser blocks unmuted
> autoplay. Viewers can unmute with the speaker button on the ad banner. Do not rely on
> audio alone to carry the message — put the important words on screen.

## 3. How the app discovers and selects an ad

**Discovery.** On request, `lib/adLibrary.js` reads this folder, keeps every file with a
supported extension, and builds an ad record for each one. The folder's contents
(filenames, sizes, modification times) are fingerprinted, so adding, replacing or
removing a file is picked up automatically within about two seconds — no restart.

Each ad gets a stable id derived from its filename:

```
vistara-premium.mp4   ->  id "vistara-premium"   ->  /api/ads/vistara-premium/stream
```

**Selection.** When a viewer opens a watch page, `GET /api/ads/next` picks **one** ad by
weighted random selection and returns its metadata plus its stream URL. An ad with
`"weight": 2` is chosen twice as often as one with `"weight": 1`. If more than one ad is
available, the endpoint avoids repeating the ad the viewer just saw (the page passes
`?exclude=<id>`).

The frontend never contains an ad filename. It asks the server which ad to play and
streams whatever it is told.

## 4. Optional metadata — `ads.config.json`

Every file here works with **no** configuration. The title is derived from the filename
(`cloudnine-hosting.mp4` → "Cloudnine Hosting"). Use `ads.config.json` only when you want
to override that:

```json
{
  "ads": {
    "my-ad.mp4": {
      "title": "My Product — Tagline here",
      "advertiser": "My Company",
      "clickUrl": "https://example.com/landing",
      "weight": 3,
      "enabled": true
    }
  }
}
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | derived from filename | Shown on the ad banner. |
| `advertiser` | string | `""` | Shown as "Ad · <advertiser>". |
| `clickUrl` | string | `""` | Makes the ad title a clickable link (opens in a new tab). |
| `weight` | number | `1` | Relative selection frequency. Higher = shown more often. |
| `enabled` | boolean | `true` | Set `false` to keep the file but stop serving it. |

Keys may be the exact filename (`"my-ad.mp4"`) or the generated id (`"my-ad"`).
A malformed `ads.config.json` is logged and ignored rather than breaking playback.

## 5. Turning ads off entirely

The master switch lives in `.env` at the project root, not in this folder:

```
ADS_ENABLED=false     # no ad, no countdown, no Skip button — video starts immediately
ADS_ENABLED=true      # normal ad flow
AD_SKIP_SECONDS=5     # how long before "Skip Ad" unlocks (0 = immediately)
```

Restart the server after editing `.env`.

## 6. What happens when this folder is empty

If `ADS_ENABLED=true` but there are no playable video files here, the server reports
that no ad is available and the main video starts immediately — exactly as if ads were
off. Nothing breaks and no empty overlay is shown.
