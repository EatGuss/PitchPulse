# PitchPulse — Submission packaging

This folder is the staging area for the final hackathon submission. **Nothing in this folder is committed to the repo** beyond this README and `github_link.txt`; the zip and binary artifacts are gitignored.

## Expected contents (before zipping)

```
submission/
├── README.md                # this file (gitignored zip stays out of repo)
├── github_link.txt          # one line: public GitHub URL of this repo
├── presentation_video.mp4   # ≤ 3 min, 1920×1080, no voice-over (see docs/demo-script.md)
├── executive_summary.pdf    # 5 slides exported from docs/executive-summary.md
└── prfaq.pdf                # optional — not in the MVP scope, can skip
```

## Steps to produce each artifact

### 1. `github_link.txt`

Edit this file. Replace the placeholder with the actual repo URL. If the repo is **private**, invite GitHub user `MoellerO` per the challenge brief.

### 2. `presentation_video.mp4`

Follow [`docs/demo-script.md`](../docs/demo-script.md) shot-by-shot. Record `/demo` at 1920×1080, ≤ 3:00, **no voice-over** — text overlays only. Export H.264 MP4.

### 3. `executive_summary.pdf`

Use [`docs/executive-summary.md`](../docs/executive-summary.md) as the slide source. Build the deck in Keynote / Google Slides / PowerPoint:
- 16:9, 1920×1080
- Dark theme (#0B0F1F bg, white text, #E10E1F accent)
- Embed all fonts (Inter)
- Export PDF "best quality"
- Insert [`docs/jumbotron-concept.png`](../docs/jumbotron-concept.png) on slide 5 (or as a bonus 6th if you have time)

### 4. (Optional) `prfaq.pdf`

The PR/FAQ is not on the MVP critical path. Skip unless time permits.

## Build the zip

The brief asks for a zip named **`<TeamName>.zip`**. Replace `<TeamName>` with your actual team name in the command below:

### PowerShell (Windows)

```powershell
cd <repo-root>\submission
Compress-Archive -Path github_link.txt, presentation_video.mp4, executive_summary.pdf -DestinationPath PitchPulse.zip -Force
# (Add prfaq.pdf to the -Path list if you produced one.)
```

### bash (macOS / Linux / WSL)

```bash
cd <repo-root>/submission
zip PitchPulse.zip github_link.txt presentation_video.mp4 executive_summary.pdf
# Add prfaq.pdf if you produced one.
```

The resulting `PitchPulse.zip` (or `<TeamName>.zip`) is what gets uploaded.

## Final checklist (run through this once before uploading)

- [ ] `github_link.txt` points to the correct public/private URL
- [ ] If repo is private, `MoellerO` has been invited and accepted
- [ ] `presentation_video.mp4` is **≤ 3:00**, **1920×1080**, no voice-over
- [ ] `executive_summary.pdf` is 5 slides, fonts embedded, < 5 MB
- [ ] No hackathon match XML in the repo (verify `git ls-files | grep Anonym` returns empty)
- [ ] No AWS access keys committed (verify `git log -p | rg AKIA` returns empty)
- [ ] `.env.local` is gitignored (verify `git check-ignore .env.local` echoes the path)
- [ ] No real DFL marks / club crests / player photos in the deck or video
- [ ] Team name in the zip filename matches your hackathon registration
