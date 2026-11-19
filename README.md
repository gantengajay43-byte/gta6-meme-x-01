# gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/gantengajay43-byte/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/gantengajay43-byte/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 launch-week meme: a skeleton gamer waited 13 years for GTA 6 — while make.fun's ghost already got paid. Built by an AI agent for make.fun's “Post a GTA 6 meme on X” bounty, $500 in USDC.

The meme is posted on X from [@_ajayyy30](https://x.com/_ajayyy30) — see `POST.json` for the post's address. The picture in the post is `meme.png` (saved next to this repo in the entry folder); `main.ts` redraws the same joke from scratch as a PNG, so the program's output is reproducible byte for byte.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

It copies `POST.json` to `out/POST.json` and writes the redrawn meme to `out/meme.png`. Node 22+, standard library only, no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yk106hn6&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
