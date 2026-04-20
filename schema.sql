-- ============================================================
-- Production & Dispatch Inventory Management System
-- PostgreSQL Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- RACKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS racks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rack_name    TEXT NOT NULL UNIQUE,
  location     TEXT,
  capacity     NUMERIC(10, 3) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTION ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS production_entries (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                   DATE NOT NULL,
  size                   TEXT NOT NULL,
  thickness              TEXT NOT NULL,
  length                 TEXT NOT NULL,
  od                     TEXT,

  -- Prime stock
  prime_tonnage          NUMERIC(10, 3) NOT NULL DEFAULT 0,
  prime_pieces           INTEGER NOT NULL DEFAULT 0,

  -- Random: Joint
  random_joint_tonnage   NUMERIC(10, 3) NOT NULL DEFAULT 0,
  random_joint_pieces    INTEGER NOT NULL DEFAULT 0,

  -- Random: CQ
  random_cq_tonnage      NUMERIC(10, 3) NOT NULL DEFAULT 0,
  random_cq_pieces       INTEGER NOT NULL DEFAULT 0,

  -- Random: Open
  random_open_tonnage    NUMERIC(10, 3) NOT NULL DEFAULT 0,
  random_open_pieces     INTEGER NOT NULL DEFAULT 0,

  -- Loss
  scrap_tonnage          NUMERIC(10, 3) NOT NULL DEFAULT 0,
  slit_wastage           NUMERIC(10, 3) NOT NULL DEFAULT 0,

  -- Storage
  rack_id                UUID REFERENCES racks(id) ON DELETE SET NULL,

  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DISPATCH ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatch_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date             DATE NOT NULL,
  size             TEXT NOT NULL,
  thickness        TEXT NOT NULL,
  length           TEXT NOT NULL,

  -- Prime
  prime_tonnage    NUMERIC(10, 3) NOT NULL DEFAULT 0,
  prime_pieces     INTEGER NOT NULL DEFAULT 0,

  -- Random (aggregate)
  random_tonnage   NUMERIC(10, 3) NOT NULL DEFAULT 0,
  random_pieces    INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RACK STOCK TABLE (running balance per rack+size+thickness)
-- ============================================================
CREATE TABLE IF NOT EXISTS rack_stock (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rack_id          UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  size             TEXT NOT NULL,
  thickness        TEXT NOT NULL,

  prime_tonnage    NUMERIC(10, 3) NOT NULL DEFAULT 0,
  prime_pieces     INTEGER NOT NULL DEFAULT 0,
  random_tonnage   NUMERIC(10, 3) NOT NULL DEFAULT 0,
  random_pieces    INTEGER NOT NULL DEFAULT 0,

  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (rack_id, size, thickness)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_production_date   ON production_entries(date);
CREATE INDEX IF NOT EXISTS idx_production_size   ON production_entries(size);
CREATE INDEX IF NOT EXISTS idx_dispatch_date     ON dispatch_entries(date);
CREATE INDEX IF NOT EXISTS idx_dispatch_size     ON dispatch_entries(size);
CREATE INDEX IF NOT EXISTS idx_rack_stock_rack   ON rack_stock(rack_id);
CREATE INDEX IF NOT EXISTS idx_rack_stock_size   ON rack_stock(size, thickness);

-- ============================================================
-- MIGRATION: Extend production_entries for detailed tracking
-- ============================================================

-- Basic operational fields
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS shift               TEXT CHECK (shift IN ('Shift A', 'Shift B')),
  ADD COLUMN IF NOT EXISTS mill_no             TEXT CHECK (mill_no IN ('Mill1', 'Mill2', 'Mill3', 'Mill4')),
  ADD COLUMN IF NOT EXISTS weight_per_pipe     NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS stamp               TEXT,
  ADD COLUMN IF NOT EXISTS raw_material_grade  TEXT;

-- Production output: Joint
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS joint_pipes         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS joint_tonnage       NUMERIC(10, 3) NOT NULL DEFAULT 0;

-- Production output: CQ
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS cq_pipes            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cq_tonnage          NUMERIC(10, 3) NOT NULL DEFAULT 0;

-- Production output: Open
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS open_pipes          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_tonnage        NUMERIC(10, 3) NOT NULL DEFAULT 0;

-- Calculated aggregates
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS random_pipes        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS random_tonnage      NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pipes         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tonnage       NUMERIC(10, 3) NOT NULL DEFAULT 0;

-- Scrap in KG (separate from existing scrap_tonnage)
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS scrap_endcut_kg     NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_bitcut_kg     NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_burning_kg    NUMERIC(10, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_scrap_kg      NUMERIC(10, 3) NOT NULL DEFAULT 0;

-- Quality
ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS rejection_percent   NUMERIC(6, 2) NOT NULL DEFAULT 0;

-- Index for mill-wise queries
CREATE INDEX IF NOT EXISTS idx_production_mill ON production_entries(mill_no);
CREATE INDEX IF NOT EXISTS idx_production_mill_size ON production_entries(mill_no, size, thickness);

-- ============================================================
-- MIGRATION: Fix shift CHECK constraint (Day/Night → Shift A/Shift B)
-- ============================================================
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'production_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%shift%';

  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE production_entries DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE production_entries
  ADD CONSTRAINT production_entries_shift_check
  CHECK (shift IN ('Shift A', 'Shift B'));

-- ============================================================
-- MIGRATION: Extend dispatch_entries with logistics fields
-- ============================================================
ALTER TABLE dispatch_entries
  ADD COLUMN IF NOT EXISTS party_name        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_no        TEXT,
  ADD COLUMN IF NOT EXISTS loading_slip_no   TEXT,
  ADD COLUMN IF NOT EXISTS order_tat         TEXT,
  ADD COLUMN IF NOT EXISTS weight_per_pipe   NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS pdi               TEXT,
  ADD COLUMN IF NOT EXISTS supervisor        TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location TEXT,
  ADD COLUMN IF NOT EXISTS remark            TEXT;

-- ============================================================
-- MIGRATION: Add stamp (IS grade) to dispatch_entries
-- ============================================================
ALTER TABLE dispatch_entries
  ADD COLUMN IF NOT EXISTS stamp TEXT;

-- ============================================================
-- BREAKDOWN REPORTS: Mill-level daily entry (one per mill per day)
-- ============================================================
CREATE TABLE IF NOT EXISTS breakdown_mill (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL,
  mill_no       TEXT NOT NULL CHECK (mill_no IN ('Mill1','Mill2','Mill3','Mill4')),
  total_time    INTEGER NOT NULL DEFAULT 1440,
  electrical_bd INTEGER NOT NULL DEFAULT 0,
  mechanical_bd INTEGER NOT NULL DEFAULT 0,
  roll_change   INTEGER NOT NULL DEFAULT 0,
  production_bd INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, mill_no)
);

-- ============================================================
-- BREAKDOWN REPORTS: Size-level entries (multiple per mill per day)
-- Each size records how many minutes it ran + production data
-- ============================================================
CREATE TABLE IF NOT EXISTS breakdown_size (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mill_entry_id  UUID NOT NULL REFERENCES breakdown_mill(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  mill_no        TEXT NOT NULL,
  size           TEXT NOT NULL,
  thickness      TEXT NOT NULL,
  time_on_size   INTEGER NOT NULL DEFAULT 0,
  prime_mt       NUMERIC(10,3) NOT NULL DEFAULT 0,
  random_mt      NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_pieces   INTEGER NOT NULL DEFAULT 0,
  total_meters   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mill_entry_id, size, thickness)
);

-- ============================================================
-- BREAKDOWN REPORTS: Reasons per Mill per Day per Size
-- ============================================================
CREATE TABLE IF NOT EXISTS breakdown_reasons (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date             DATE NOT NULL,
  mill_no          TEXT NOT NULL CHECK (mill_no IN ('Mill1', 'Mill2', 'Mill3', 'Mill4')),
  size             TEXT NOT NULL,
  thickness        TEXT NOT NULL,
  department       TEXT NOT NULL CHECK (department IN ('Electrical', 'Mechanical', 'Production')),
  reason           TEXT NOT NULL,
  time_taken       INTEGER NOT NULL DEFAULT 0,
  times_repeated   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breakdown_mill_date      ON breakdown_mill(date, mill_no);
CREATE INDEX IF NOT EXISTS idx_breakdown_size_mill      ON breakdown_size(mill_entry_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_size_date      ON breakdown_size(date, mill_no);
CREATE INDEX IF NOT EXISTS idx_breakdown_reasons_date   ON breakdown_reasons(date, mill_no);
CREATE INDEX IF NOT EXISTS idx_breakdown_reasons_size   ON breakdown_reasons(size, thickness);

-- ============================================================
-- SEED DATA: Default Racks
-- ============================================================
INSERT INTO racks (rack_name, location, capacity) VALUES
  ('Rack-A1', 'Bay 1 - Section A', 50),
  ('Rack-A2', 'Bay 1 - Section B', 50),
  ('Rack-B1', 'Bay 2 - Section A', 75),
  ('Rack-B2', 'Bay 2 - Section B', 75),
  ('Rack-C1', 'Bay 3 - Section A', 100),
  ('Rack-C2', 'Bay 3 - Section B', 100),
  ('Rack-D1', 'Bay 4 - Section A', 60),
  ('Rack-D2', 'Bay 4 - Section B', 60)
ON CONFLICT (rack_name) DO NOTHING;
