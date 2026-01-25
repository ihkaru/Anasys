# 📈 Anasys

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun_v1.0+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![Vue](https://img.shields.io/badge/Frontend-Vue_3-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org)
[![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-FDC500?logo=postgresql&logoColor=black)](https://www.timescale.com/)     
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
| **Real-time Feeds** | WebSocket-powered updates for Stocks, Crypto, and Forex markets. |
| **Portfolio Tracker** | Unified view of your holdings, P/L, and cost basis calculations. |
| **Advanced Charts** | Interactive candle, line, and sparkline charts optimized for heavy datasets. |
| **Smart Watchlists** | "Hold-to-Delete" gestures and drag-and-drop organization. |
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

## ⚡ Quick Start

### Prerequisites
- **Docker** & **Docker Compose**
- **Bun** (v1.0 or higher)

### Installation

1. **Clone & Setup**
   ```bash
   git clone https://github.com/ihkaru/Anasys.git
   cd Anasys
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   cp credential_analisis.example.json credential_analisis.json
   ```
   > *Note: You'll need a Google Cloud Client ID/Secret for the `credential_analisis.json` to enable OAuth.*

3. **Start Infrastructure**
   ```bash
   docker-compose up -d postgres
   ```

4. **Install & Hydrate**
   ```bash
   bun install
   bun run db:push
   # (Optional) Seed initial data
   bun run --filter @apps/backend seed
   ```

5. **Launch**
   ```bash
   bun run dev
   ```
   Visit the app at `http://localhost:5173`.

## 📂 Architecture (Monorepo)

Anasys uses a modern monorepo structure managed by Bun Workspaces for maximum code sharing and developer velocity.

```
Anasys/
├── apps/
│   ├── backend/    # ElysiaJS API Server
│   └── frontend/   # Vue 3 + Vite Client
├── packages/
│   ├── db/         # Drizzle Schema & Shared DB Logic
│   └── shared/     # Shared Types & Utilities
├── docker-compose.yml
└── package.json
```

## 🗺️ Roadmap

- [x] Basic Portfolio Tracking
- [x] Real-time Market Data
- [x] Google OAuth Integration
- [ ] Multiple Portfolio Support
- [ ] Email Alerts & Notifications
- [ ] Public Status Pages
- [ ] Docker Hub Built Images

## 🤝 Contributing

We love contributions! Please read our [Contributing Guide](CONTRIBUTING.md) (coming soon) for details on our code of conduct and the process for submitting pull requests.

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ihkaru">ihkaru</a>
</p>
