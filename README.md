# 📈 Analisis - Finance Dashboard

A powerful, self-hostable finance dashboard built with **Bun**, **Vue.js**, **ElysiaJS**, and **TimescaleDB**. Track your portfolio, watch market trends, and get real-time insights with a beautiful, responsive UI.

## ✨ Features

- **Real-time Market Data:** Live updates for Stocks, Crypto, and Forex.
- **Portfolio Management:** Track holdings, average costs, and P&L.
- **Interactive Charts:** High-performance candle & sparkline charts using TimescaleDB optimization.
- **Watchlists:** Create and manage custom watchlists with "Hold-to-Delete" gestures.
- **Secure Auth:** Google OAuth2 integration with secure session management.
- **Modern UI:** Mobile-first, glassmorphism design using Framework7 & Vue 3.

## 🚀 Quick Start (Self-Hosting)

Prerequisites:
- [Docker](https://www.docker.com/) & Docker Compose
- [Bun](https://bun.sh/) (v1.0+)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/analisis.git
cd analisis
```

### 2. Configure Environment
Create the `.env` file from the example:
```bash
cp .env.example .env
```
*Note: The default credentials work out-of-the-box for local development.*

Create the Google Credentials file:
```bash
cp credential_analisis.example.json credential_analisis.json
```
*You will need a [Google Cloud Console](https://console.cloud.google.com/) project to get a Client ID/Secret for OAuth.*

### 3. Start Database
Spin up the TimescaleDB instance using Docker:
```bash
docker-compose up -d postgres
```

### 4. Install Dependencies & Setup DB
Install packages and push the schema to the database:
```bash
bun install
bun run db:push
# (Optional) Seed initial popular tickers without massive download:
bun run --filter @apps/backend seed
```

### 5. Run the App
Start both the backend and frontend in development mode:
```bash
bun run dev
```
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Swagger Docs:** http://localhost:3000/swagger

## 🛠 Tech Stack

- **Runtime:** [Bun](https://bun.sh/) - Fast JavaScript runtime.
- **Backend:** [ElysiaJS](https://elysiajs.com/) - Ergonomic web framework.
- **Frontend:** [Vue 3](https://vuejs.org/) + [Framework7](https://framework7.io/) - Hybrid mobile/web apps.
- **Database:** [TimescaleDB](https://www.timescale.com/) (PostgreSQL extension) - Time-series data power.
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM.

## 📂 Project Structure

This is a **monorepo** managed by Bun workspaces:

- `apps/backend`: ElysiaJS API server.
- `apps/frontend`: Vue 3 + Vite application.
- `packages/db`: Shared Drizzle schema and database utilities.

## 🛡 Security

- **Credentials:** Never commit `.env` or `credential_analisis.json`. These are ignored by git.
- **Auth:** Uses Google OAuth2 + JWT (Jose) for stateless, secure authentication.

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](LICENSE)
