CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS telemetry_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  met_hours     DOUBLE PRECISION NOT NULL,
  dist_earth_km DOUBLE PRECISION,
  dist_moon_km  DOUBLE PRECISION,
  speed_kmh     DOUBLE PRECISION,
  altitude_km   DOUBLE PRECISION,
  range_rate_kms DOUBLE PRECISION,
  solar_phase_deg DOUBLE PRECISION,
  g_force       DOUBLE PRECISION,
  source        VARCHAR(32) NOT NULL,
  raw           JSONB
);

CREATE INDEX idx_telemetry_captured_at ON telemetry_snapshots (captured_at DESC);
