# MySQL to PostgreSQL Migration Guide

This guide explains how to migrate your existing MySQL ORM to PostgreSQL using the pg-format strategy.

## Key Changes Implemented

### 1. Database Driver Replacement

- **Before**: `mysql2` package
- **After**: `pg` and `pg-format` packages

### 2. Connection Pool Changes

```javascript
// MySQL (old)
const mysql = require("mysql2");
pool = mysql.createPool(credentials);

// PostgreSQL (new)
const { Pool } = require("pg");
pool = new Pool(credentials);
```

### 3. Dynamic Column/Table Name Handling

**Strategy**: Using `pg-format` library with `%I` and `%L` placeholders

```javascript
// MySQL (old)
const statement = `SELECT * FROM ?? WHERE ?? = ?`;
pool.query(statement, [table, column, value], callback);

// PostgreSQL (new)
const format = require("pg-format");
const statement = format("SELECT * FROM %I WHERE %I = $1", table, column);
pool.query(statement, [value], callback);
```

### 4. Parameter Placeholders

- **MySQL**: Uses `?` for values and `??` for identifiers
- **PostgreSQL**: Uses `$1, $2, $3...` for values and `%I` for identifiers (via pg-format)

### 5. Upsert Logic Transformation

```javascript
// MySQL (old)
INSERT INTO table (col1, col2) VALUES (?, ?)
ON DUPLICATE KEY UPDATE col1 = VALUES(col1), col2 = VALUES(col2)

// PostgreSQL (new)
INSERT INTO table (col1, col2) VALUES ($1, $2)
ON CONFLICT (unique_column) DO UPDATE SET col1 = EXCLUDED.col1, col2 = EXCLUDED.col2
```

### 6. Result Handling Changes

```javascript
// MySQL (old)
results.insertId; // Get inserted ID
results.affectedRows; // Get affected row count
results; // Direct array of rows

// PostgreSQL (new)
results.rows[0].id; // Get inserted ID (with RETURNING clause)
results.rowCount; // Get affected row count
results.rows; // Array of rows
```

## Files Modified

1. **src/db-postgres.js** - Complete PostgreSQL implementation
2. **package.json** - Added `pg` and `pg-format` dependencies
3. **postgres-usage-example.js** - Usage examples
4. **postgres-strategy-example.js** - Strategy documentation

## Configuration Changes

### MySQL Configuration (old)

```javascript
const mysqlConfig = {
  host: "localhost",
  user: "root",
  password: "password",
  database: "mydb",
  connectionLimit: 10,
};
```

### PostgreSQL Configuration (new)

```javascript
const postgresConfig = {
  user: "postgres",
  host: "localhost",
  database: "mydb",
  password: "password",
  port: 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

## Schema Migration Notes

Your existing model definitions work unchanged:

```javascript
const userModel = model(
  db, // Now use PostgreSQL db instead of MySQL
  "users",
  {
    id: "required|integer",
    name: "required|string",
    email: "required|email",
  },
  "id", // primary key
  ["email"], // unique columns
  { safeDelete: "deleted" }
);
```

## Database Schema Changes Required

### Auto-increment Fields

```sql
-- MySQL (old)
CREATE TABLE users (
  id int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (id)
);

-- PostgreSQL (new)
CREATE TABLE users (
  id SERIAL PRIMARY KEY
);
-- OR
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);
```

### JSON Fields

```sql
-- MySQL (old)
info JSON NOT NULL

-- PostgreSQL (new)
info JSONB NOT NULL  -- JSONB recommended for better performance
-- OR
info JSON NOT NULL   -- Standard JSON if needed
```

### Timestamps

```sql
-- MySQL (old)
created_at datetime NOT NULL DEFAULT current_timestamp(),
modified_at datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()

-- PostgreSQL (new)
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- Note: PostgreSQL doesn't have ON UPDATE, use triggers if needed
```

## Migration Steps

1. **Install Dependencies**

   ```bash
   npm install pg pg-format
   ```

2. **Replace Database Layer**

   - Replace `src/db.js` with `src/db-postgres.js`
   - Or create a new file and update imports

3. **Update Connection Configuration**

   - Change from MySQL config to PostgreSQL config
   - Update connection credentials

4. **Migrate Database Schema**

   - Convert MySQL DDL to PostgreSQL DDL
   - Update auto-increment fields to SERIAL
   - Update timestamp fields
   - Test with sample data

5. **Update Tests**
   - Change test database schema creation
   - Update any MySQL-specific test queries

## Benefits of This Approach

1. **Minimal Code Changes**: Your model layer remains unchanged
2. **Type Safety**: `pg-format` provides safe identifier quoting
3. **Performance**: PostgreSQL's advanced features and optimizations
4. **Standard SQL**: More standards-compliant SQL syntax
5. **JSON Support**: Better JSON/JSONB handling in PostgreSQL

## Testing the Migration

1. Run your existing tests with the new PostgreSQL setup
2. Compare query results between MySQL and PostgreSQL
3. Test all CRUD operations (Create, Read, Update, Delete)
4. Verify bulk operations work correctly
5. Test soft delete functionality if used

The model.js file requires NO changes - it continues to work exactly as before!
