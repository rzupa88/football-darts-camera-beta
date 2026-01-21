# Current State (today 01/21/2026)

- ## Prod runtime on Pi

    - Command: npm run dev
    - Repo: football-darts
    - Port: default (same as dev)
    - Input: click-based dart entry
    - DB: footballdarts
    - Status: stable, in-use

- ## Beta runtime on Pi

    - Command: npm run dev
    - Repo: football-darts-camera-beta
    - Port: ❌ currently the SAME as prod
    - Input: click-based only (camera not wired yet)
    - DB: footballdarts_beta
    - Status: not reliably loading / conflicts with prod

- ## Databases

    - footballdarts → production
    - footballdarts_beta → development
    - Connection strings live in .env

- ## What works

    - Beta repo builds
    - Beta app logic works (same as prod)
    - Beta DB exists and is reachable
    - Local testing on Pi works

- ## What fails

    - Beta and prod cannot safely run at the same time
    - “Beta not loading” is due to port + process collision, not DB issues