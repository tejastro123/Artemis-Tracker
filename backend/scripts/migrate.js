const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const logger = require('../src/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../src/db/migrations');

async function runMigrations() {
  logger.info('Starting manual database migrations...');

  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      logger.info(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      
      await pool.query(sql);
      logger.info(`Completed migration: ${file}`);
    }

    logger.info('All migrations completed successfully.');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
