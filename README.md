# Sektori Scores

Local 2-player high score tracker prototype for Jared and Steve.

## Run

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` with your Postgres connection string:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/sektori
```

3. Start the server:

```bash
npm start
```

Open http://localhost:3000 in your browser.

## Optional edit key

- Set an edit key to require writes:

```bash
EDIT_KEY=your-secret npm start
```

- When an edit key is set, include it in the URL as a query string so the client sends it automatically:

```
http://localhost:3000/?key=your-secret
```

## Data storage

- Postgres is the source of truth. The app does not write to the filesystem.
- Tables are created and seeded automatically on startup.
- History is stored in the `history` table.

## Render deployment notes

- Create a Render Postgres instance and attach it to the web service.
- Render will provide `DATABASE_URL`; ensure it is present in environment variables.
- Optional: set `EDIT_KEY` in Render environment variables.
- Build command: `npm install`
- Start command: `npm start`

## Logo

- Place or replace the logo at `public/logo.png`.
