# Deep Finance Research Agent

This repository contains a full-stack app (Nest backend + React frontend).  
This README explains how to run the app locally (node/npm) and with Docker Compose (Postgres + Redis Stack).

> **Note:** adjust `API_BASE` / `.env` values in your app if your ports or hostnames differ.

---

## Prerequisites

- Node 18+ / npm 8+ (or pnpm/yarn if you prefer — update scripts accordingly)
- Run Docker Compose file before running the project. 
```bash
# from repo root
docker compose up -d
```

---


## 1. Local development (without Docker services)

### 1.1 Install dependencies

```bash
# from  / backend-nestjs
npm install
npm run start:dev
````

```bash
# from  / frontend
npm install
npm run dev
````

```bash
# from / python
pip install -r requirements.txt

#1 terminal
python -u main.py

#2 terminal
python worker.py
````

````
try to refresh frontend for some random hydration errors.
````
