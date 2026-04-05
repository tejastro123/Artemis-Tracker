CREATE TABLE IF NOT EXISTS news_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url         TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT,
  source      VARCHAR(64),
  published_at TIMESTAMPTZ,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  relevance_score SMALLINT DEFAULT 1
);

CREATE INDEX idx_news_published ON news_items (published_at DESC);
CREATE INDEX idx_news_source ON news_items (source);
