// Example configuration for PostgreSQL with automatic schema handling

require("dotenv").config();
const { db } = require("./src/index");

console.log("Schema config before connect:", db.getSchemaConfig());

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

console.log("Schema config after connect:", db.getSchemaConfig());

// Test table name formatting
console.log("Table name formatting test:");
console.log("formatTableName('users'):", db.formatTableName("users"));
console.log("getTableIdentifier('users'):", db.getTableIdentifier("users"));

// Test pg-format directly
const format = require("pg-format");
console.log(
  "Direct pg-format test:",
  format("%I.%I", "spense_invest", "users")
);

// That's it! The system now automatically:
// - Uses DB_NAME as schema in production/development (e.g., "spense_invest.table_name")
// - Uses public schema only for unit tests when NODE_ENV="TEST"
// - Properly formats all table references with pg-format for safety

module.exports = db;
