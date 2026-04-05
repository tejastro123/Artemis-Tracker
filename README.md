# Artemis Tracker

A comprehensive application for tracking the Artemis II Mission, including crew schedules, mission updates, and real-time mission status.

## Project Structure

- `backend/`: Node.js Express server with MongoDB integration. Handles data fetching from NASA and community APIs.
- `frontend/`: Simple and performant HTML/JS application for mission visualization.

## Getting Started

### Backend Setup

1. Navigate to the `backend/` directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

   *Modify the variables in `.env` as required.*
4. Start the server:

   ```bash
   npm start
   ```

### Frontend Setup

The frontend consists of static HTML/JS files. You can serve them using any local web server or open `frontend/index.html` directly in a browser.

## Testing

To run tests for the backend, navigate to `backend/` and use:

```bash
npm test
```

## add media

```bash
node scripts/add_drive_media.js "Mission Launch View" "image" "YOUR_DRIVE_LINK_HERE"
```

## License

All rights reserved. [Artemis Mission](https://www.nasa.gov/specials/artemis/)
