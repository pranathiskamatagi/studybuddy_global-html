# Learnora 🌍

**Learn. Teach. Grow together.**

Learnora is a peer-to-peer learning platform that connects students from around the world to learn from — and teach — each other. Pick a subject you want to learn, get matched with a study partner, chat (or join a group session), and earn points, diamonds, and badges along the way.

This repo is the **frontend**: a fully connected, static HTML/CSS/JavaScript app. No backend or database yet — that's the next phase.

## Features

- **Onboarding** — welcome screen, signup, login, terms & conditions
- **Learn or Teach** — choose a subject, topic, and level, then get matched with a partner (or join a group chat)
- **Live sessions** — 1:1 chat, group chat, quizzes, teaching tips
- **AI summaries & mind maps** — auto-generated recap after every session (placeholder content for now — real AI is planned, see [Roadmap](#roadmap))
- **Ratings** — rate your study partner and leave a badge + comment
- **Gamification** — points, diamonds, leaderboard, and an achievements screen with reward payouts
- **Profile** — edit profile, saved summaries, settings, notifications, and a safety center
- **Safety** — in-chat reporting, blocking, and clear safety guidelines

## Tech stack

Plain **HTML, CSS, and JavaScript** — no frameworks, no build step. Data that needs to persist (saved summaries, profile edits, notifications) is stored in the browser's `localStorage`.

## Running it locally

No installation needed — it's static files.

1. Clone the repo
2. Open `index.html` in your browser, **or** use a local dev server (e.g. VS Code's [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension) so page navigation and `localStorage` work smoothly
3. Start clicking through from the welcome screen

## Project structure

Every screen is a self-contained trio of files: `screen-name.html`, `screen-name.css`, `screen-name.js`. There's no separate `src/` folder — all files live at the repo root for simplicity.

## Roadmap

The frontend is functionally complete. Next up is the backend:

- **Gamification backend** — persist points, diamonds, and badges server-side per the app's exact earning rules
- **AI backend** — safety monitoring (flagging shared personal info), distraction warnings, smarter partner matching, and real AI-generated summaries & mind maps

## Contributing

This project is actively developed by [@pranathiskamatagi](https://github.com/pranathiskamatagi). Issues and pull requests are welcome.
