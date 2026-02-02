# 📈 Anasys

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun_v1.0+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![Vue](https://img.shields.io/badge/Frontend-Vue_3-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org)
[![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-FDC500?logo=postgresql&logoColor=black)](https://www.timescale.com/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg?style=flat-square)](https://github.com/ihkaru/Anasys/actions)     
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

**Anasys** is a high-performance, self-hostable finance dashboard designed for the modern investor. Built on the bleeding edge **Bun** runtime, it leverages **TimescaleDB** for lightning-fast time-series data processing and **Vue 3** for a buttery smooth user experience.

---

## 🌟 Why Anasys?

We built Anasys because existing self-hosted finance tools were either too slow, too ugly, or too hard to deploy. Anasys bridges the gap between professional-grade data analysis and consumer-friendly UX.

- **🚀 Blazing Fast**: Powered by Bun and ElysiaJS, API responses are measured in microseconds.
- **📊 Data Heavy**: Built on TimescaleDB to handle millions of market data points without breaking a sweat.
- **🎨 Beautiful**: A "Glassmorphism" UI design that looks as premium as the assets you track.
- **🔒 Privacy First**: Your data stays on your server. No third-party tracking.

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **Multi-Source Data** |  Aggregates data from **Yahoo Finance** and **TradingView** for maximum coverage. |
| **Real-time Feeds** | WebSocket-powered updates for Stocks, Crypto, and Forex markets. |
| **Portfolio Tracker** | Unified view of your holdings, P/L, and cost basis calculations. |
| **Advanced Charts** | Interactive candle, line, and sparkline charts optimized for heavy datasets. |
| **Smart Watchlists** | "Hold-to-Delete" gestures and drag-and-drop organization. |
| **Self-Healing Data** | Automatically detects and repairs missing symbols, currencies (IDR/USD), and metadata in the background. |
| **Multi-Currency** | Native support for global assets (IDR, USD, etc.) with correct formatting. |
| **Secure Auth** | Integrated Google OAuth2 with secure, stateless session management (JWT). |
| **Mobile First** | Responsive design that feels native on iOS and Android. |

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | ![Bun](https://img.shields.io/badge/-Bun-black) | Ultra-fast JavaScript runtime & package manager. |
| **Framework** | ![Elysia](https://img.shields.io/badge/-ElysiaJS-ff0050) | High-performance backend framework for Bun. |
| **Frontend** | ![Vue](https://img.shields.io/badge/-Vue_3-4fc08d) | Progressive JavaScript framework. |
| **UI Lib** | ![F7](https://img.shields.io/badge/-Framework7-ee350f) | Full-featured mobile HTML framework. |
| **Database** | ![Timescale](https://img.shields.io/badge/-TimescaleDB-fdc500) | Time-series powerhouse based on PostgreSQL. |
| **ORM** | ![Drizzle](https://img.shields.io/badge/-Drizzle-c5f74f) | Lightweight and type-safe TypeScript ORM. |

---

## ⚡ Quick Start (One Command!)

### Prerequisites

- **Docker** & **Docker Compose** (for PostgreSQL/TimescaleDB)
- **Bun** v1.0+ ([Install Bun](https://bun.sh))
- **WSL** (if on Windows)

### 🚀 Automated Setup

```bash
# Clone the repository
git clone https://github.com/ihkaru/Anasys.git
cd Anasys

# Run the setup wizard (handles everything!)
bun run setup
```

The setup wizard will:
1. ✅ Check prerequisites (Bun, Docker)
2. ✅ Create `.env` file with sensible defaults
3. ✅ Start PostgreSQL container
4. ✅ Install all dependencies
5. ✅ Push database schema
6. ✅ (Optional) Seed market data
7. ✅ Validate data consistency

### 🎉 Start Development

```bash
bun run dev
```

Visit the app at `http://localhost:5173`.

---

## 📖 Manual Setup

If you prefer manual control, follow these steps:

```bash
# 1. Clone & enter directory
git clone https://github.com/ihkaru/Anasys.git
cd Anasys

# 2. Setup environment
cp .env.example .env
# Edit .env and set JWT_SECRET to a secure random string!

# 3. Start database
docker compose up -d postgres

# 4. Install dependencies
bun install

# 5. Push database schema
bun run db:push

# 6. (Optional) Seed market data (~15-20 mins)
bun run db:seed

# 7. Validate data
bun run test:consistency

# 8. Start development servers
bun run dev
```

---

## 📜 Available Commands

All commands are run from the project root using `bun run <command>`:

| Command | Description |
| :--- | :--- |
| `setup` | 🚀 **One-command setup wizard** |
| `dev` | Start all development servers |
| `build` | Build for production |
| `test` | Run all tests |
| `test:consistency` | Run data consistency tests |
| `lint` | Check code style |
| `lint:fix` | Fix code style issues |

### Database Commands

| Command | Description |
| :--- | :--- |
| `db:push` | Push schema changes to database |
| `db:studio` | Open Drizzle Studio (GUI) |
| `db:seed` | Seed database with market data |
| `db:audit` | Detect and remove anomalous data |
| `db:repair` | Full repair for all symbols |
| `db:repair:vip` | Repair VIP symbols only (faster) |
| `db:clean` | Reset database (destructive!) |

---

## 📂 Architecture (Monorepo)

Anasys uses a modern monorepo structure managed by Bun Workspaces for maximum code sharing and developer velocity.

```
Anasys/
├── apps/
│   ├── backend/    # ElysiaJS API Server
│   └── frontend/   # Vue 3 + Vite Client
├── packages/
│   ├── db/         # Drizzle Schema & Shared DB Logic
│   ├── analysis/   # Trading Strategy & Signal Analysis
│   └── shared/     # Shared Types & Utilities
├── scripts/
│   └── setup.ts    # Automated setup wizard
├── docker-compose.yml
└── package.json
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database (required)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/analisis

# JWT Secret (required - use a secure random string!)
JWT_SECRET=your_secure_random_string_at_least_32_characters

# CORS (adjust for production)
CORS_ORIGIN=http://localhost:5173

# Server
PORT=3000
NODE_ENV=development
```

### Google OAuth (Optional)

For Google Login functionality, create `credential_analisis.json`:

```json
{
  "web": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://localhost:5173/auth/callback"]
  }
}
```

---

## 🔄 Maintenance

### Automatic (Built-in Scheduler)

| Task | Frequency | Description |
| :--- | :--- | :--- |
| Stale Symbol Sync | Every 1 hour | Syncs oldest symbols with Yahoo Finance |

### Manual Commands

| Command | Frequency | Description |
| :--- | :--- | :--- |
| `bun run db:repair:vip` | Daily | Repair VIP symbol data |
| `bun run test:consistency` | Weekly | Validate data integrity |
| `bun run db:audit` | Monthly | Clean anomalous data |
| `bun run db:repair` | As needed | Full repair (~1 hour) |

---

## 🗺️ Roadmap

- [x] Basic Portfolio Tracking
- [x] Real-time Market Data
- [x] Google OAuth Integration
- [x] Automated Setup Wizard
- [x] Data Consistency Tests
- [ ] Multiple Portfolio Support
- [ ] Email Alerts & Notifications
- [ ] Docker Hub Built Images
- [ ] Public Status Pages

---

## 🤝 Contributing

We love contributions! Please read our [Contributing Guide](CONTRIBUTING.md) (coming soon) for details.

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ihkaru">ihkaru</a>
</p>
