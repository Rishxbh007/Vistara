# Vistara — Self-Hosted Video Streaming Platform

A self-hosted video streaming platform with pre-roll ads, built on Node.js/Express and vanilla JavaScript. Run your own private streaming service — upload videos, create an account, and stream through a custom video player, all from a single server with zero build step and no separate database server to install.

## Features

- **Video upload & streaming** through a custom-built video player
- **User accounts** with JWT-based authentication
- **Pre-roll video ads** with countdown timer and Skip button
- **One-toggle ad control** — set `ADS_ENABLED` to turn ads on or off
- **Zero-configuration storage** — SQLite via sql.js, no database server needed
- **Single-server design** — the Express backend serves both the API and the web pages (port 3000)

## Tech Stack

- **Backend:** Node.js, Express (REST APIs + page serving)
- **Frontend:** Vanilla HTML, CSS, JavaScript with a custom video player
- **Database:** SQLite via sql.js
- **Auth:** JSON Web Tokens (JWT)

## Getting Started

See [HOW_TO_RUN.md](HOW_TO_RUN.md) for setup and run instructions.

## Why I Built This

To understand how streaming platforms work end to end — backend API design, authentication, media handling, and how ad systems are integrated into a video product.
