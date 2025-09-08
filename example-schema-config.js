// Example configuration for PostgreSQL with automatic schema handling

const { db } = require("./src/index");

// Connect to database
db.connect({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
  max: 100,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// That's it! The system now automatically:
// - Uses DB_NAME as schema in production (e.g., "spense_invest.table_name")
// - Uses public schema for tests when NODE_ENV is 'test' or 'TEST'
// - Properly formats all table references with pg-format for safety

console.log("Schema config:", db.getSchemaConfig());

module.exports = db;
