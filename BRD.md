# Business Requirements Document (BRD)

**Document Title:** PTM — Production & Dispatch Inventory Management System
**Version:** 1.0
**Date:** April 27, 2026
**Prepared by:** Abhishek Alli
**Submitted to:** Director
**Status:** Active Development — ~85% Complete

---

## Table of Contents

1. [Business Problem & Objectives](#1-business-problem--objectives)
2. [Project Scope](#2-project-scope)
3. [Key Stakeholders](#3-key-stakeholders)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Constraints](#6-constraints)
7. [Technology Stack](#7-technology-stack)
8. [Estimated Effort & Value](#8-estimated-effort--value)
9. [Project Milestones & Timeline](#9-project-milestones--timeline)
10. [Project Status Report](#10-project-status-report)
11. [Attachments & References](#11-attachments--references)

---

## 1. Business Problem & Objectives

### 1.1 Background

The pipe manufacturing department operates four rolling mills (Mill1–Mill4) producing a wide range of steel pipe sizes and thicknesses. Prior to this system, all production and dispatch data was maintained manually — using physical registers, Excel sheets, and verbal communication. This approach was error-prone, slow, and offered no real-time visibility into inventory levels or mill performance.

### 1.2 Pain Points Before the System

| # | Pain Point | Business Impact |
|---|-----------|-----------------|
| 1 | Manual register entries for every shift's production | Errors in tonnage calculation, duplicate entries, data loss |
| 2 | No real-time stock visibility | Dispatches made without knowing true stock — risk of over-dispatch |
| 3 | Stock reconciliation done weekly/monthly | Discrepancies found too late to correct |
| 4 | No mill efficiency or speed tracking | No data to benchmark or improve mill performance |
| 5 | Breakdown time not recorded systematically | Could not identify recurring breakdown causes or most problematic sizes |
| 6 | Dispatch records in separate sheets from production | Could not compute net stock automatically |
| 7 | No export or reporting capability | Management reports created manually, delayed decision-making |

### 1.3 Objectives

- **O1:** Provide a real-time, accurate stock ledger computed as production minus dispatch.
- **O2:** Enable structured batch entry of production and dispatch data, reducing manual effort.
- **O3:** Track mill-wise breakdown time and size-wise machine speed for operational analytics.
- **O4:** Support data export (Excel) for use in management reporting and external sharing.
- **O5:** Provide a clear monthly breakdown analysis to identify root causes of downtime.
- **O6:** Maintain a single source of truth accessible from any device on the local network.

---

## 2. Project Scope

### 2.1 In Scope

- Web-based application accessible on the factory LAN.
- Six functional modules: Dashboard, Production, Dispatch, Live Stock, Reports, Breakdown Reports.
- Support for 4 mills, 50+ pipe sizes, 15 thickness variants, and 4 IS grade stamps.
- Shift-wise production entries (Shift A / Shift B).
- Batch entry (multiple rows in one submission) for both production and dispatch.
- Real-time stock computation (production − dispatch) per size, thickness, and rack.
- Excel export for production, dispatch, and stock data.
- Breakdown time entry, reason logging, speed calculation, and monthly analysis.
- CSV/Excel import for bulk data upload.
- Pagination, date-range filtering, and size/thickness filtering on all list views.

### 2.2 Out of Scope

- Mobile application (iOS/Android).
- External integrations (ERP, SAP, Tally).
- Purchase / raw material (coil) inventory tracking.
- User authentication / role-based access control (future phase).
- Automated alerts / SMS / email notifications.
- Billing, invoicing, or financial accounting.
- Multi-factory or multi-plant support.
- Cloud deployment (system runs on local server).

---

## 3. Key Stakeholders

| Role | Name / Department | Responsibility |
|------|-------------------|----------------|
| Sponsor / Approver | Director | Reviews and approves project requirements and budget |
| Department Head | Production Manager | Defines production entry requirements, reviews reports |
| Operations | Mill Supervisors | Enters daily production and breakdown data |
| Dispatch | Dispatch Team | Logs daily dispatch entries, uses stock view |
| Developer | Abhishek Alli | Full-stack development, deployment, and maintenance |
| End Users | Factory Floor Operators | Batch entry of shift data |

---

## 4. Functional Requirements

### 4.1 Module 1: Dashboard

**Purpose:** Provide a quick snapshot of production and dispatch activity at a glance.

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F1.1 | Summary stat cards | Total production MT (all-time & this month), Total dispatch MT (all-time & this month) | High |
| F1.2 | Navigation hub | Quick links to all six modules via sidebar | High |
| F1.3 | System version display | Version number shown in sidebar footer | Low |

**In Scope:** Read-only aggregate metrics from production and dispatch APIs.
**Out of Scope:** Real-time push notifications, charts/graphs (future enhancement).

---

### 4.2 Module 2: Production

**Purpose:** Record all pipe production data shift-by-shift, per mill, per size.

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F2.1 | Single entry form | Fields: Date, Shift, Mill No., Size, Thickness, Length, OD, Weight/Pipe, Stamp (IS Grade), Raw Material Grade, Prime Tonnage, Prime Pieces, Joint Pipes, Joint Tonnage, CQ Pipes, CQ Tonnage, Open Pipes, Open Tonnage, Scrap Endcut (KG), Scrap Bitcut (KG), Scrap Burning (KG) | High |
| F2.2 | Auto-calculation | Random Tonnage = Joint + CQ + Open; Total Tonnage = Prime + Random; Total Pipes = Prime + Random; Total Scrap KG = Sum of 3 scrap fields; Rejection % = (scrap / total) × 100 | High |
| F2.3 | Batch entry | Add multiple production rows in a table UI; submit all at once | High |
| F2.4 | Batch auto-calc columns | Total MT, Total Pieces, Coil Consumption (Total MT × 1.005) auto-calculated per row, read-only | High |
| F2.5 | Auto-calculate pieces | If weight per pipe is entered: pieces = (tonnage × 1000) / weight_per_pipe | Medium |
| F2.6 | Edit entries | Edit any saved production entry inline | Medium |
| F2.7 | Delete entry | Delete individual entries with confirmation | High |
| F2.8 | List view | Paginated table of all entries with filters: date range, size, thickness | High |
| F2.9 | Stat cards | All-time and this-month production MT and pieces | Medium |
| F2.10 | Mill summary | Table showing per-mill totals: pipes, tonnage, prime vs random breakdown | Medium |
| F2.11 | Excel export | Export all filtered entries to .xlsx with columns in prescribed order | High |
| F2.12 | CSV / Excel import | Bulk import entries from a formatted CSV/Excel file | Medium |
| F2.13 | Delete all | Clear all production entries (with confirmation) | Low |

**Excel Export Column Order:** Date → Shift → Mill NO. → Size → Thickness → Length → OD → Stamp → Prime Tonnage → Prime Pieces → Joint Tonnage → CQ Tonnage → Open Tonnage → Random Tonnage → Random Pipe Pieces → Prime+Random Tonnage → Prime+Random Pieces → Coil Consumption → Scrap (KG)

**Supported Sizes:** 50+ pipe sizes (19.05 OD to 200×100)
**Supported Thicknesses:** 1.2 mm to 6 mm (15 options)
**IS Grades (Stamp):** IS-4923, IS-1161, IS-3601, IS-1239

**In Scope:** All production recording and reporting for Mills 1–4.
**Out of Scope:** Raw material coil tracking, shift roster management.

---

### 4.3 Module 3: Dispatch

**Purpose:** Record all pipe dispatches, validate against live stock, and deduct inventory automatically.

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F3.1 | Single entry form | Fields: Date, Size, Thickness, Length, Stamp, Prime Tonnage, Prime Pieces, Random Tonnage, Random Pieces, Party Name, Vehicle No., Loading Slip No., Order TAT, Weight/Pipe, PDI, Supervisor, Delivery Location, Remark | High |
| F3.2 | Stock validation | Before saving, checks aggregate stock ≥ requested quantity; returns HTTP 422 with details if insufficient | High |
| F3.3 | Batch entry | Multiple dispatch rows entered in a table UI; submitted together | High |
| F3.4 | FIFO deduction | Dispatches deducted from racks in oldest-updated-first order | High |
| F3.5 | Delete entry | Delete entry reverses stock deduction | High |
| F3.6 | List view | Paginated table with filters: date range, size, thickness | High |
| F3.7 | Stat cards | All-time and this-month dispatch MT | Medium |
| F3.8 | Excel export | Export filtered entries to .xlsx | High |
| F3.9 | CSV / Excel import | Bulk import from formatted file | Medium |
| F3.10 | Delete all | Clear all dispatch entries (with confirmation) | Low |

**Excel Export Column Order:** Date → Size → Thickness → Length → Stamp → Prime Tonnage → Prime Pieces → Random Tonnage

**In Scope:** All dispatch recording with automatic stock management.
**Out of Scope:** Delivery tracking after dispatch, customer portal, billing.

---

### 4.4 Module 4: Live Stock

**Purpose:** Display real-time inventory = total production minus total dispatch, per size, per rack.

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F4.1 | Stock summary table | Per size+thickness: prime tonnage, prime pieces, random tonnage, random pieces | High |
| F4.2 | Grand total cards | Overall prime MT, random MT, combined tonnage and pieces | High |
| F4.3 | Rack-wise cards | Individual rack stock showing prime and random tonnage per size | Medium |
| F4.4 | Size/thickness filter | Filter stock view by specific size or thickness | Medium |
| F4.5 | Stock as-of date | Query stock as of any historical date | Medium |
| F4.6 | Prime matrix | Shows prime produced vs prime dispatched per size | Medium |
| F4.7 | Detailed stock view | Shows stock by length and stamp (IS grade) | Medium |

**Stock Formula:**
```
Prime Stock   = Σ prime_tonnage (production) − Σ prime_tonnage (dispatch)
Random Stock  = Σ (joint + CQ + open) tonnage (production) − Σ random_tonnage (dispatch)
```

**In Scope:** Read-only calculated stock from production and dispatch tables.
**Out of Scope:** Physical stock audit/count reconciliation, rack capacity alerts.

---

### 4.5 Module 5: Reports

**Purpose:** Provide summarised production vs dispatch analytics across all size-thickness combinations.

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F5.1 | Production summary table | All size+thickness combinations shown; rows with no data show as 0.000 (dimmed) | High |
| F5.2 | Dispatch summary table | Same all-combos grid for dispatch | High |
| F5.3 | Scrap summary | Total scrap tonnage and slit wastage | Medium |
| F5.4 | Date range filter | Filter report by from/to date | High |
| F5.5 | Export | Download report data | Medium |

**In Scope:** Aggregated summaries; all 50+ size × 15 thickness combinations always visible.
**Out of Scope:** Trend charts, year-over-year comparison, forecasting.

---

### 4.6 Module 6: Breakdown Reports

**Purpose:** Track daily mill downtime, calculate efficiency and speed, and identify recurring breakdown causes.

This module has a **two-level data structure:**
- **Mill Level** — one record per mill per day, stores all breakdown time categories.
- **Size Level** — multiple records per mill per day, each storing how long that size ran.

#### Tab 1: Time & Speed Entry

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F6.1 | Mill selector | Select Date + Mill No. to start entry | High |
| F6.2 | Load sizes | Auto-load sizes that ran on that mill that day from production_entries | High |
| F6.3 | Mill-level inputs | Total Time (default 1440), Electrical BD, Mechanical BD, Roll Change, Production BD | High |
| F6.4 | Auto-calc (mill) | Total BD = sum of 4 BD types; Available Time = Total Time − Total BD; Efficiency % = (Available / Total) × 100 | High |
| F6.5 | Size rows table | Per size: Size, Thickness, Time on Size (editable), Prime MT (read-only), Random MT (read-only), Total Pieces (read-only), Total Meters (read-only), Size Speed MPM (auto-calc) | High |
| F6.6 | Size Speed MPM | Size Speed = total_meters / time_on_size | High |
| F6.7 | Mill Speed MPM | Mill Speed = sum(total_meters) / available_time | High |
| F6.8 | Time balance validator | Shows sum of time_on_size vs available_time; warns if mismatched | Medium |
| F6.9 | Save entry | Upsert: updates if entry for same date+mill already exists | High |
| F6.10 | Saved entries list | Expandable table showing all mill entries; chevron expands size detail | Medium |
| F6.11 | Delete entry | Remove mill entry (cascades to size entries) | High |

#### Tab 2: Breakdown Reasons

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F6.12 | Reason entry | Date, Mill No., Size, Thickness, Department (Electrical/Mechanical/Production), Reason text, Time Taken (min), Times Repeated | High |
| F6.13 | Size filter by date+mill | Only sizes that ran on that date+mill available in dropdown | Medium |
| F6.14 | Batch reason entry | Add multiple reason rows at once | High |
| F6.15 | Reason list | Paginated list with filters: date range, mill, size, department | High |
| F6.16 | Delete reason | Remove individual reason entry | High |

#### Tab 3: Speed Analysis

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F6.17 | Mill-wise speed table | Per mill per day: total meters, total BD time, available time, mill speed MPM, efficiency % | High |
| F6.18 | Size-wise speed table | Per size+thickness+mill+date: time on size, total meters, prime MT, random MT, speed MPM | High |
| F6.19 | Toggle view | Switch between mill-wise and size-wise tables | Medium |
| F6.20 | Date range filter | Filter speed analysis by date range | High |

#### Tab 4: Monthly Analysis

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F6.21 | Month+Year selector | Select month and year for analysis period | High |
| F6.22 | Summary cards | Total occurrences, total time lost, mills affected, days with breakdowns | Medium |
| F6.23 | Recurring reasons table | Grouped by size+thickness+department+reason; shows occurrence count, total repeats, total time lost, mills affected, days occurred, max single time | High |
| F6.24 | Sort by time lost | Default order: highest total time lost first | Medium |

**In Scope:** All 4 mills; breakdown categories: Electrical, Mechanical, Production, Roll Change.
**Out of Scope:** Maintenance work orders, spare parts inventory, predictive maintenance.

---

## 5. Non-Functional Requirements

| # | Category | Requirement |
|---|----------|-------------|
| NF1 | Performance | Page load < 2 seconds on local LAN; API response < 500 ms for list queries |
| NF2 | Availability | System available during all production shifts (24×7 on local server) |
| NF3 | Usability | Minimal training required; form defaults pre-filled; validation messages in plain language |
| NF4 | Data Integrity | All stock mutations (production insert/delete, dispatch insert/delete) wrapped in DB transactions |
| NF5 | Data Accuracy | Stock calculated from live DB queries, not cached; dispatch validated against current stock before save |
| NF6 | Scalability | Supports 1–2 years of daily entries (est. ~3,000 production rows/year) without performance degradation |
| NF7 | Browser Support | Chrome and Edge (latest); no IE support required |
| NF8 | Responsiveness | Usable on desktop; tablet support for supervisors entering data at mill |
| NF9 | Export | Excel files open correctly in Microsoft Excel 2016+ |
| NF10 | Input UX | No spinner arrows on number inputs; clean tabular data entry |

---

## 6. Constraints

| # | Constraint | Impact |
|---|-----------|--------|
| C1 | No external internet access on factory LAN | System must be fully self-hosted; no CDN, no SaaS |
| C2 | Single developer, no dedicated budget | Feature scope prioritized; no paid third-party services |
| C3 | No authentication in current scope | All users have full access; suitable for controlled factory environment |
| C4 | Database must run on existing Windows PC | PostgreSQL installed locally; no managed database services |
| C5 | Data entered by non-technical operators | UI must be simple and forgiving; validation must be clear |
| C6 | No mobile devices available for data entry | Desktop-first design; mobile not a priority |

---

## 7. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend Framework | Next.js (React) | 14.2.29 | Server-side rendering, routing, UI |
| Language | TypeScript | 5.x | Type safety across frontend |
| Styling | Tailwind CSS | 3.4.1 | Utility-first responsive design |
| HTTP Client | Axios | 1.7.2 | API calls from frontend to backend |
| Date Handling | date-fns | 3.6.0 | Date formatting and manipulation |
| Icons | Lucide React | 0.395.0 | Consistent icon set throughout UI |
| Notifications | React Hot Toast | 2.4.1 | In-app success/error toasts |
| Excel Export | SheetJS (xlsx) | 0.18.5 | Client-side Excel file generation |
| PDF Export | jsPDF + AutoTable | 4.2.1 / 5.0.7 | PDF report generation |
| Backend Framework | Express.js | 4.19.2 | REST API server |
| Database Driver | node-postgres (pg) | 8.11.5 | PostgreSQL connection pool |
| Validation | express-validator | 7.1.0 | Request input validation |
| Runtime | Node.js | 18+ LTS | Backend JavaScript runtime |
| Database | PostgreSQL | 14+ | Primary data store |
| Dev Tool | Nodemon | 3.1.0 | Auto-restart during development |

**Architecture Pattern:** REST API (Express) + Client-Side Rendering (Next.js) + PostgreSQL
**Deployment:** Local Windows PC — backend on port 5001, frontend on port 3000

---

## 8. Estimated Effort & Value

### 8.1 Effort Estimate

| Module | Development Effort | Status |
|--------|--------------------|--------|
| Project Setup & Infrastructure | 8 hrs | Complete |
| Database Schema Design | 6 hrs | Complete |
| Module 1: Dashboard | 4 hrs | Complete |
| Module 2: Production (CRUD + Batch + Export) | 20 hrs | Complete |
| Module 3: Dispatch (CRUD + Batch + Validation) | 18 hrs | Complete |
| Module 4: Live Stock | 10 hrs | Complete |
| Module 5: Reports | 8 hrs | Complete |
| Module 6: Breakdown Reports (all 4 tabs) | 30 hrs | Complete |
| Testing & Bug Fixes | 10 hrs | Ongoing |
| **Total Estimated Effort** | **~114 hrs** | |

### 8.2 Business Value

| Value Driver | Estimated Benefit |
|-------------|-------------------|
| Elimination of manual register errors | Reduction in production data discrepancies |
| Real-time stock visibility | Zero over-dispatch incidents |
| Automated Excel export | Management reporting time reduced from hours to seconds |
| Mill speed tracking | Data-driven identification of underperforming sizes/mills |
| Monthly breakdown analysis | Targeted preventive maintenance planning |

---

## 9. Project Milestones & Timeline

| # | Milestone | Target Date | Status |
|---|-----------|-------------|--------|
| M1 | Project setup, schema design, Express scaffold | Week 1 | ✅ Complete |
| M2 | Production module — single entry + list + delete | Week 2 | ✅ Complete |
| M3 | Dispatch module — single entry + stock validation | Week 3 | ✅ Complete |
| M4 | Live Stock module — rack-wise calculations | Week 4 | ✅ Complete |
| M5 | Reports module — summary + all-combos grid | Week 5 | ✅ Complete |
| M6 | Production batch entry + Excel export reorder | Week 6 | ✅ Complete |
| M7 | Dispatch batch entry + Excel export | Week 6 | ✅ Complete |
| M8 | Breakdown module — schema + backend routes | Week 7 | ✅ Complete |
| M9 | Breakdown — Time & Speed Entry tab (Tab 1) | Week 7 | ✅ Complete |
| M10 | Breakdown — Reasons tab (Tab 2) | Week 7 | ✅ Complete |
| M11 | Breakdown — Speed Analysis tab (Tab 3) | Week 8 | ✅ Complete |
| M12 | Breakdown — Monthly Analysis tab (Tab 4) | Week 8 | ✅ Complete |
| M13 | CSV/Excel import feature | Week 8 | ✅ Complete |
| M14 | UI polish — remove spinners, widen inputs | Week 8 | ✅ Complete |
| M15 | User acceptance testing with operators | TBD | 🔲 Pending |
| M16 | Production deployment on factory server | TBD | 🔲 Pending |

---

## 10. Project Status Report

### 10.1 Overall Status

| Metric | Value |
|--------|-------|
| Total Modules | 6 |
| Modules Complete | 6 |
| Overall Completion | ~85% (development done; UAT pending) |
| Open Issues | None critical |
| Blocking Issues | None |

---

### 10.2 Module-by-Module Status

#### Module 1: Dashboard
| Work Item | Status |
|-----------|--------|
| Stat cards (production + dispatch totals) | ✅ Done |
| Sidebar navigation with all 6 modules | ✅ Done |
| Responsive layout | ✅ Done |

#### Module 2: Production
| Work Item | Status |
|-----------|--------|
| Single entry form with all fields | ✅ Done |
| Auto-calculation (random, total, coil consumption) | ✅ Done |
| Auto-calculate pieces from weight per pipe | ✅ Done |
| Edit existing entries | ✅ Done |
| Delete entries | ✅ Done |
| Batch entry (multiple rows at once) | ✅ Done |
| Batch auto-calc columns (Total MT, Pieces, Coil) | ✅ Done |
| Pagination + filtering | ✅ Done |
| Mill summary table | ✅ Done |
| Excel export (correct column order) | ✅ Done |
| CSV/Excel import | ✅ Done |
| Scrap KG field in batch | ✅ Done |
| OD field in batch | ✅ Done |

#### Module 3: Dispatch
| Work Item | Status |
|-----------|--------|
| Single entry form (all logistics fields) | ✅ Done |
| Stock validation before save | ✅ Done |
| FIFO rack deduction | ✅ Done |
| Delete with stock reversal | ✅ Done |
| Batch entry | ✅ Done |
| Pagination + filtering | ✅ Done |
| Excel export (correct column order) | ✅ Done |
| CSV/Excel import | ✅ Done |

#### Module 4: Live Stock
| Work Item | Status |
|-----------|--------|
| Real-time stock summary | ✅ Done |
| Grand total stat cards | ✅ Done |
| Rack-wise breakdown cards | ✅ Done |
| Stock as-of-date query | ✅ Done |
| Prime matrix view | ✅ Done |
| Detailed stock by length+stamp | ✅ Done |

#### Module 5: Reports
| Work Item | Status |
|-----------|--------|
| Production summary table | ✅ Done |
| Dispatch summary table | ✅ Done |
| All size+thickness combos always shown (zero rows visible) | ✅ Done |
| Date range filter | ✅ Done |
| Scrap summary | ✅ Done |

#### Module 6: Breakdown Reports
| Work Item | Status |
|-----------|--------|
| Database tables (breakdown_mill, breakdown_size, breakdown_reasons) | ✅ Done |
| Backend API (6 routes) | ✅ Done |
| Tab 1: Mill-level BD time input | ✅ Done |
| Tab 1: Size auto-load from production | ✅ Done |
| Tab 1: Size Speed MPM auto-calc | ✅ Done |
| Tab 1: Mill Speed MPM auto-calc | ✅ Done |
| Tab 1: Time balance validator | ✅ Done |
| Tab 1: Save / upsert mill entry | ✅ Done |
| Tab 1: Expandable saved entries list | ✅ Done |
| Tab 2: Breakdown reasons batch entry | ✅ Done |
| Tab 2: Paginated reasons list with filters | ✅ Done |
| Tab 3: Mill-wise speed analysis table | ✅ Done |
| Tab 3: Size-wise speed analysis table | ✅ Done |
| Tab 4: Monthly recurring analysis | ✅ Done |
| Tab 4: Summary cards | ✅ Done |
| Number input spinner removal (all pages) | ✅ Done |

### 10.3 Remaining Work

| # | Item | Priority | Effort |
|---|------|----------|--------|
| R1 | User Acceptance Testing with mill supervisors and dispatch team | High | 4–6 hrs |
| R2 | Run breakdown table migration SQL in production database | High | 30 min |
| R3 | Production server deployment (backend + frontend startup) | High | 2–3 hrs |
| R4 | Operator training session and user guide | Medium | 2 hrs |
| R5 | User authentication / login (future phase) | Low | 20+ hrs |
| R6 | Mobile-responsive UI refinement (future phase) | Low | 10+ hrs |
| R7 | Dashboard charts and trend graphs (future phase) | Low | 15+ hrs |

---

## 11. Attachments & References

### 11.1 Database Schema

Full schema available at: `schema.sql` (project root)

**Core Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `production_entries` | All production shift records | date, mill_no, shift, size, thickness, prime_tonnage, random_tonnage, scrap_kg |
| `dispatch_entries` | All dispatch records | date, size, thickness, prime_tonnage, random_tonnage, party_name, vehicle_no |
| `racks` | Rack definitions | rack_name, location, capacity |
| `rack_stock` | Live stock per rack+size+thickness | prime_tonnage, prime_pieces, random_tonnage, random_pieces |
| `breakdown_mill` | Mill-level daily breakdown entry | date, mill_no, electrical_bd, mechanical_bd, roll_change, production_bd |
| `breakdown_size` | Size-level entries per mill per day | size, thickness, time_on_size, prime_mt, random_mt, total_meters |
| `breakdown_reasons` | Root cause entries per breakdown | department, reason, time_taken, times_repeated |

### 11.2 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET/POST | `/api/production` | List / create production entries |
| PUT | `/api/production/:id` | Update production entry |
| DELETE | `/api/production/:id` | Delete production entry |
| GET | `/api/production/totals` | Production totals (all-time + this month) |
| GET | `/api/production/mill-summary` | Per-mill production summary |
| DELETE | `/api/production/all` | Delete all production entries |
| POST | `/api/production/import` | Bulk import production entries |
| GET/POST | `/api/dispatch` | List / create dispatch entries |
| DELETE | `/api/dispatch/:id` | Delete dispatch entry |
| GET | `/api/dispatch/totals` | Dispatch totals |
| DELETE | `/api/dispatch/all` | Delete all dispatch entries |
| POST | `/api/dispatch/import` | Bulk import dispatch entries |
| GET | `/api/stock` | Live stock summary |
| GET | `/api/stock/report` | Production vs dispatch report |
| GET | `/api/stock/as-of` | Stock as of a historical date |
| GET | `/api/stock/prime-matrix` | Prime produced vs dispatched matrix |
| GET | `/api/stock/detail` | Detailed stock by length+stamp |
| GET | `/api/breakdown/production-sizes` | Sizes that ran on a mill+date |
| POST | `/api/breakdown/entry` | Save/upsert mill breakdown entry |
| GET | `/api/breakdown/entries` | List all breakdown entries |
| DELETE | `/api/breakdown/entry/:id` | Delete mill entry + sizes |
| GET | `/api/breakdown/speed-analysis` | Size-wise and mill-wise speed data |
| GET/POST | `/api/breakdown/reasons` | List / add breakdown reasons |
| DELETE | `/api/breakdown/reasons/:id` | Delete a breakdown reason |
| GET | `/api/breakdown/analysis` | Monthly recurring breakdown analysis |

### 11.3 Supported Pipe Sizes

50+ sizes ranging from **19.05 OD** to **200×100**, covering round (OD), square, rectangular, and NB pipe profiles.

### 11.4 Supported Thicknesses

15 variants: 1.2 mm, 1.6 mm, 1.8 mm, 2 mm, 2.2 mm, 2.5 mm, 2.9 mm, 3 mm, 3.2 mm, 3.6 mm, 4 mm, 4.5 mm, 5 mm, 5.5 mm, 6 mm.

### 11.5 IS Grade Stamps Supported

- SRJ + IS-4923
- SRJ + IS-1161
- SRJ + IS-3601
- SRJ + IS-1239

### 11.6 Project Directory Structure

```
inward-outward-ptm/
├── BRD.md                        ← This document
├── schema.sql                    ← PostgreSQL schema + migrations
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js              ← Express entry point (port 5001)
│       ├── db/                   ← Database connection pool
│       └── routes/
│           ├── production.js
│           ├── dispatch.js
│           ├── stock.js
│           ├── breakdown.js
│           └── racks.js
└── frontend/
    ├── package.json
    ├── tailwind.config.ts
    ├── lib/
    │   ├── api.ts                ← Axios client + TypeScript types
    │   └── constants.ts          ← Pipe sizes, thicknesses, IS grades
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── PageHeader.tsx
    │   ├── StatCard.tsx
    │   ├── EmptyState.tsx
    │   ├── Spinner.tsx
    │   └── CsvImportModal.tsx
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx              ← Dashboard
        ├── production/page.tsx
        ├── dispatch/page.tsx
        ├── stock/page.tsx
        ├── reports/page.tsx
        └── breakdown/page.tsx
```

---

*Document prepared by Abhishek Alli | PTM Inventory Management System | April 2026*
