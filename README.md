# Time Management App

A web-based time tracking system for managing employee clock-in/out, archiving, and session history.

## Local Setup

### Prerequisites
- Node.js installed
- MySQL 8.0+ running locally on port 3306

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/MarkJustine28/Time-Management.git
   cd Time-Management
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Create `.env` file in the `backend` folder:
   ```bash
   cp .env.example .env
   ```
   (Or manually create `backend/.env` with these defaults):
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=
   DB_NAME=timemanagement
   APP_PORT=3000
   ```

4. Start the backend:
   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser

## Features
- **Time Tracking:** Clock employees in/out with timestamps
- **Employee Management:** Add, archive, and restore employees
- **History:** View past session records with duration
- **Export:** Download daily timesheets as CSV
- **Archive:** Move inactive employees with auto-purge after 30 days
- **Permanent Delete:** Remove employee records completely

## Tech Stack
- **Frontend:** HTML5, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express
- **Database:** MySQL 8.0+

## Database Schema
The app automatically creates tables on first run:
- `employees`: Stores employee records with archive status
- `sessions`: Stores time in/out records with duration tracking
