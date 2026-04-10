# PTM — Production & Dispatch Inventory Management System

A full-stack web application for pipe manufacturing companies to manage **Production**, **Dispatch**, and **Live Stock** with rack-based inventory tracking.

---

## Tech Stack

| Layer    | Technology                         |
|----------|------------------------------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Axios |
| Backend  | Node.js + Express                  |
| Database | PostgreSQL (local or Supabase)     |
| Export   | xlsx (Excel export)                |

---

## Folder Structure

```
inward-outward-ptm/
├── schema.sql               ← PostgreSQL schema + seed data
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── index.js         ← Express app entry
│       ├── db/
│       │   ├── index.js     ← pg Pool
│       │   └── migrate.js   ← Run schema.sql
│       ├── middleware/
│       │   └── validation.js
│       └── routes/
│           ├── production.js
│           ├── dispatch.js
│           ├── stock.js
│           └── racks.js
└── frontend/
    ├── .env.local.example
    ├── package.json
    ├── tailwind.config.ts
    ├── lib/
    │   └── api.ts           ← Axios client + TypeScript types
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── PageHeader.tsx
    │   ├── StatCard.tsx
    │   ├── EmptyState.tsx
    │   └── Spinner.tsx
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx         ← Dashboard
        ├── production/
        │   └── page.tsx
        ├── dispatch/
        │   └── page.tsx
        ├── stock/
        │   └── page.tsx
        └── reports/
            └── page.tsx
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local) **or** a Supabase project

---

## Setup Instructions

### 1. Database Setup

#### Option A — Local PostgreSQL
```bash
# Create the database
psql -U postgres -c "CREATE DATABASE ptm_db;"

# Run the schema (creates tables + seeds 8 default racks)
psql -U postgres -d ptm_db -f schema.sql
```

#### Option B — Supabase
1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** → paste the contents of `schema.sql` → Run
3. Copy the **Connection String** from Project Settings → Database

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection string

# Start development server
npm run dev
```

The backend will run on **http://localhost:5000**

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# The default NEXT_PUBLIC_API_URL=http://localhost:5000 is correct for local dev

# Start development server
npm run dev
```

The frontend will run on **http://localhost:3000**

---

## API Reference

| Method | Endpoint              | Description                     |
|--------|-----------------------|---------------------------------|
| GET    | /api/health           | Health check                    |
| GET    | /api/racks            | List all racks with stock totals |
| POST   | /api/racks            | Create a rack                   |
| DELETE | /api/racks/:id        | Delete a rack                   |
| GET    | /api/production       | List production entries (paginated, filterable) |
| POST   | /api/production       | Create entry + update rack_stock |
| DELETE | /api/production/:id   | Delete entry + reverse rack_stock |
| GET    | /api/dispatch         | List dispatch entries            |
| POST   | /api/dispatch         | Create dispatch + deduct stock (with validation) |
| DELETE | /api/dispatch/:id     | Delete dispatch + restore stock  |
| GET    | /api/stock            | Live stock per rack+size+thickness |
| GET    | /api/stock/report     | Production vs dispatch summary   |

### Query Parameters (GET /api/production, /api/dispatch)
- `page` — page number (default: 1)
- `limit` — records per page (default: 50, max: 200)
- `size` — filter by pipe size (partial match)
- `thickness` — filter by thickness
- `date_from` / `date_to` — date range filter

### Query Parameters (GET /api/stock)
- `size`, `thickness`, `rack_id` — filters

---

## Business Logic

### Stock Calculation
```
Prime Stock  = Σ prime_tonnage (production)  − Σ prime_tonnage (dispatch)
Random Stock = Σ (joint + CQ + open) (production) − Σ random_tonnage (dispatch)
```
Scrap and slit wastage are **excluded** from stock calculations.

### Production Flow
1. Insert `production_entries` record
2. `UPSERT` into `rack_stock` — adds prime + random tonnage/pieces to the target rack

### Dispatch Flow
1. Validate that aggregate stock ≥ requested quantities
2. If valid: insert `dispatch_entries`
3. Deduct from `rack_stock` using FIFO (oldest-updated rack first)
4. If insufficient: return `422` with detailed error message

---

## Features

| Feature                        | Status |
|--------------------------------|--------|
| Production entry form          | ✅     |
| Dispatch entry with stock check| ✅     |
| Live stock dashboard           | ✅     |
| Rack-wise breakdown cards      | ✅     |
| Reports (summary + detail)     | ✅     |
| Excel export (all pages)       | ✅     |
| Filters (size, thickness, date)| ✅     |
| Pagination                     | ✅     |
| Delete with stock reversal     | ✅     |
| FIFO dispatch deduction        | ✅     |
| Real-time stock availability   | ✅     |
| Responsive design              | ✅     |

---

## Production Build

```bash
# Backend
cd backend && npm start

# Frontend
cd frontend && npm run build && npm start
```

---

## Environment Variables

### Backend (`backend/.env`)
```
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/ptm_db
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:5000
```
