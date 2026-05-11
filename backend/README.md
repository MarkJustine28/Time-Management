# Time Management Backend

Simple Node + Express API using MySQL to store employees and sessions.

Setup

1. Install dependencies

```bash
cd "c:\Users\ERICCO ROSALES\Documents\time management\backend"
npm install
```

2. Create a MySQL database and copy `.env.example` to `.env`, then set credentials.

3. Set `APP_PORT=3000` in `.env` if you want to override the API port.

4. Start the server

```bash
cd backend
npm start
```

5. Open the UI in a browser

- If you prefer to open the HTML file directly, open `index.html` in your browser.
- Or, once the backend is running it will also serve the UI. Open `http://localhost:<PORT>/` (replace `<PORT>` with the port logged when the server starts — e.g. `3000`, `3001`, or `3002`).

Example (if server logs "Server listening on 3002"):

```text
http://localhost:3002/
```

API Endpoints

- `GET /health` — health check
- `GET /roster` — list of employee names
- `GET /today` — today's sessions and active entries
- `POST /employee/timein` — JSON `{ employeeName, timeInIso }`
- `POST /employee/timeout` — JSON `{ employeeName, timeOutIso }`
- `POST /reset` — resets today's sessions
- `GET /export` — download CSV of today's completed sessions
