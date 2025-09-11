const { Pool } = require("pg");
const format = require("pg-format");
const { jsonSafeParse } = require("./function");

let pool = null;
let currentSchema = null;
const WHERE_INVALID = "Invalid filter object";

function connect(credentials) {
  pool = new Pool(credentials);

  // Add connection pool error handling
  pool.on("error", (err, client) => {
    console.error("Unexpected error on idle client", err);
  });

  // Always use database name as schema - consistent across all environments
  currentSchema = credentials.database;

  return pool;
}

// Helper function to format table name with schema (DB_NAME.table_name)
function formatTableName(tableName) {
  // Handle null/undefined table names
  if (tableName === null || tableName === undefined) {
    throw new Error("Table name cannot be null or undefined");
  }

  const result =
    currentSchema && !tableName.includes(".")
      ? `${currentSchema}.${tableName}`
      : tableName;

  return result;
}

// Helper function to get a properly formatted table identifier for pg-format
function getTableIdentifier(tableName) {
  // Handle null/undefined table names
  if (tableName === null || tableName === undefined) {
    throw new Error("Table name cannot be null or undefined");
  }

  let result;
  if (currentSchema && !tableName.includes(".")) {
    // Format as "schema"."table" using pg-format for safety - ensure separate quotes
    result = `${format("%I", currentSchema)}.${format("%I", tableName)}`;
  } else {
    result = format("%I", tableName);
  }

  return result;
}

// Debug function to log the current configuration
function getSchemaConfig() {
  return {
    currentSchema,
    hasPool: !!pool,
  };
}

function query(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, parameters, function (error, results) {
      if (error) {
        reject(error);
      } else {
        resolve(results.rows);
      }
    });
  });
}

function sort_builder(sort) {
  // Handle null/undefined sort arrays
  if (!sort || sort.length < 1) {
    return {
      query: "",
      values: [],
    };
  }
  let query_items = [];
  for (const item of sort) {
    if (item[0] === "-") {
      query_items.push(format("%I DESC", item.replace("-", "")));
    } else {
      query_items.push(format("%I ASC", item));
    }
  }
  let query = "ORDER BY " + query_items.join(",");
  return {
    query,
    values: [],
  };
}

function where(filter, safeDelete = null) {
  try {
    if (
      filter === null ||
      filter === "" ||
      filter.length === 0 ||
      filter[0].length == [[]] ||
      filter[0][0].length == [[[]]]
    ) {
      if (safeDelete === null) {
        return {
          query: "",
          values: [],
        };
      } else {
        filter = [[]];
      }
    }
  } catch (err) {
    return null;
  }
  if (safeDelete !== null) {
    for (const filterItem of filter) {
      filterItem.push([safeDelete, "=", 0]);
    }
  }

  const valid_conditionals = [
    "=",
    "like",
    "not like",
    "in",
    "not in",
    "<",
    ">",
    "<=",
    ">=",
    "!=",
  ];

  let conditionOr = [];
  let values = [];
  let paramIndex = 1;

  for (const i of filter) {
    let conditionAnd = [];
    for (const j of i) {
      if (!valid_conditionals.includes(j[1])) {
        return null;
      }
      if ((j[1] === "in" || j[1] === "not in") && !Array.isArray(j[2])) {
        return null;
      }

      if (j[1] === "in" || j[1] === "not in") {
        const placeholders = j[2].map(() => `$${paramIndex++}`).join(", ");
        conditionAnd.push(format("%I %s (%s)", j[0], j[1], placeholders));
        values.push(...j[2]);
      } else if (j[1] === "like" || j[1] === "not like") {
        conditionAnd.push(format("%I %s $%s", j[0], j[1], paramIndex++));
        values.push("%" + j[2] + "%");
      } else {
        conditionAnd.push(format("%I %s $%s", j[0], j[1], paramIndex++));
        values.push(j[2]);
      }
    }
    conditionOr.push(conditionAnd.join(" AND "));
  }

  let query = "WHERE ((" + conditionOr.join(") OR (") + "))";
  const result = {
    query,
    values,
  };
  return result;
}

function get(table, filter = [], sort = [], safeDelete = null) {
  const response = {};
  return new Promise(async (resolve, reject) => {
    const whereData = where(filter, safeDelete);
    const sortData = sort_builder(sort);

    if (whereData === null) {
      reject({ message: WHERE_INVALID });
      return;
    }

    const tableIdentifier = getTableIdentifier(table);
    const statement =
      `SELECT * FROM ${tableIdentifier} ${whereData.query} ${sortData.query}`.trim();
    const allValues = [...whereData.values, ...sortData.values];

    // Use connection-level error handling like in qcount()
    try {
      const client = await pool.connect();
      try {
        const results = await client.query(statement, allValues);
        response["data"] = jsonSafeParse(results.rows);
        client.release();

        // Now get the count
        try {
          const count = await qcount(table, filter, safeDelete);
          response["count"] = count;
          resolve(response);
        } catch (qcountError) {
          reject(qcountError);
        }
      } catch (queryError) {
        client.release();
        reject({ message: queryError.message });
      }
    } catch (connectionError) {
      console.log(`[ERROR] get() connection failed:`, connectionError.message);
      reject({ message: connectionError.message });
    }
  });
}

function list(
  table,
  filter = [],
  sort = [],
  safeDelete = null,
  page = 0,
  limit = 30
) {
  const response = {};
  return new Promise((resolve, reject) => {
    const whereData = where(filter, safeDelete);
    const sortData = sort_builder(sort);

    if (whereData == null) {
      reject({ message: WHERE_INVALID });
      return;
    }

    const tableIdentifier = getTableIdentifier(table);
    const statement = `SELECT * FROM ${tableIdentifier} ${whereData.query} ${
      sortData.query
    } LIMIT $${whereData.values.length + 1} OFFSET $${
      whereData.values.length + 2
    }`.trim();

    const allValues = [...whereData.values, limit, page * limit];
    pool.query(statement, allValues, function (error, results) {
      if (error) {
        reject({ message: error.message });
        return;
      }
      response["data"] = jsonSafeParse(results.rows);

      qcount(table, filter, safeDelete)
        .then((count) => {
          response["count"] = count;
          resolve(response);
        })
        .catch(reject);
    });
  });
}

function qcount(table, filter, safeDelete = null) {
  return new Promise(async (resolve, reject) => {
    const whereData = where(filter, safeDelete);
    if (whereData == null) {
      reject({ message: WHERE_INVALID });
      return;
    }
    const tableIdentifier = getTableIdentifier(table);
    const statement =
      `SELECT count(*) AS number FROM ${tableIdentifier} ${whereData.query}`.trim();
    const client = await pool.connect();
    try {
      const results = await client.query(statement, whereData.values);
      client.release();
      resolve(parseInt(results.rows[0].number));
      return;
    } catch (queryError) {
      client.release(); // Always release the client
      throw queryError; // Re-throw to trigger alternatives
    }
  });
}

function remove(table, filter, safeDelete = null) {
  return new Promise((resolve, reject) => {
    const whereData = where(filter);
    if (whereData == null) {
      reject({ message: WHERE_INVALID });
      return;
    }

    if (whereData.values.length < 1) {
      reject({ status: "unable to remove as there is no filter attributes" });
      return;
    }

    let statement = "";
    let values = [];

    if (safeDelete != null) {
      const tableIdentifier = getTableIdentifier(table);
      statement = `UPDATE ${tableIdentifier} SET ${format(
        "%I",
        safeDelete
      )} = $${whereData.values.length + 1} ${whereData.query}`.trim();
      values = [...whereData.values, 1];
    } else {
      const tableIdentifier = getTableIdentifier(table);
      statement = `DELETE FROM ${tableIdentifier} ${whereData.query}`.trim();
      values = whereData.values;
    }
    pool.query(statement, values, function (error, results) {
      if (error || results === undefined) {
        reject({ message: error.message });
        return;
      }
      if (results) {
        let rows = results.rowCount || 0;
        resolve({
          message: rows + " " + table + (rows > 1 ? "s" : "") + " removed",
        });
      }
    });
  });
}

function upsert(table, data, uniqueKeys = []) {
  return new Promise((resolve, reject) => {
    let array = [];
    const promises = [];
    let count = 0;
    let total = 0;

    if (!isset(data[0])) {
      array.push(data);
    } else {
      array = data;
    }

    // Convert data types to ensure PostgreSQL compatibility
    array = convertDataTypes(array);

    const insertColumns = Object.keys(array[0]);

    // Parse constraints to separate composite and simple constraints
    const parsedConstraints = parseConstraints(uniqueKeys);
    const flattenedKeys = flattenConstraints(uniqueKeys);

    const updateColumns = insertColumns.filter(
      (col) => !flattenedKeys.includes(col)
    );

    // Build VALUES clause for bulk insert
    let values = [];
    let valueRows = [];

    for (const [i, v] of Object.entries(array)) {
      if (array.hasOwnProperty(i)) {
        const rowValues = [];
        for (const col of insertColumns) {
          rowValues.push(v[col]);
        }
        valueRows.push(rowValues);
        count++;
        total++;

        if (count > 999) {
          promises.push(
            executeUpsert(
              table,
              insertColumns,
              updateColumns,
              parsedConstraints,
              valueRows
            )
          );
          valueRows = [];
          count = 0;
        }
      }
    }

    if (count > 0) {
      promises.push(
        executeUpsert(
          table,
          insertColumns,
          updateColumns,
          parsedConstraints,
          valueRows
        )
      );
    }

    const response = {
      rows: total,
      message:
        (total === 1
          ? `1 ${namify(table)} is `
          : `${total} ${namify(table)}s are `) + "saved",
      type: "success",
    };

    Promise.all(promises)
      .then((results) => {
        try {
          if (
            total === 1 &&
            results[0] &&
            results[0].rows &&
            results[0].rows.length > 0
          ) {
            response["id"] = extractId(results[0].rows[0]);
          }
          resolve(response);
        } catch (err) {
          reject(err);
        }
      })
      .catch((error) => {
        reject({ message: error.message, type: "danger" });
      });
  });
}

function executeUpsert(
  table,
  insertColumns,
  updateColumns,
  parsedConstraints,
  valueRows
) {
  return new Promise((resolve, reject) => {
    const tableIdentifier = getTableIdentifier(table);
    const columnNames = insertColumns
      .map((col) => format("%I", col))
      .join(", ");

    let statement;
    const hasConstraints =
      parsedConstraints.composite.length > 0 ||
      parsedConstraints.simple.length > 0;

    if (hasConstraints) {
      const updateClause =
        updateColumns.length > 0
          ? updateColumns.map((col) => format("%I = s.%I", col, col)).join(", ")
          : format("%I = s.%I", insertColumns[0], insertColumns[0]); // fallback if no update columns

      // Build conflict clause for composite and simple constraints
      const buildConflictClause = () => {
        const constraints = [];

        // Add composite constraints (multi-column unique constraints)
        parsedConstraints.composite.forEach((compositeConstraint) => {
          const cols = compositeConstraint
            .map((col) => format("%I", col))
            .join(", ");
          constraints.push(`(${cols})`);
        });

        // Add simple constraints (single-column unique constraints)
        parsedConstraints.simple.forEach((simpleConstraint) => {
          constraints.push(format("%I", simpleConstraint));
        });

        return constraints.join(", ");
      };

      if (
        parsedConstraints.composite.length === 1 &&
        parsedConstraints.simple.length === 0
      ) {
        // Single composite constraint - use standard ON CONFLICT with composite key
        const valuePlaceholders = valueRows
          .map((row, rowIndex) => {
            return (
              "(" +
              row
                .map((value, colIndex) => {
                  const paramIndex =
                    rowIndex * insertColumns.length + colIndex + 1;
                  const columnName = insertColumns[colIndex];
                  const typeCast = getPostgreSQLTypeCast(columnName, value);
                  return `$${paramIndex}${typeCast}`;
                })
                .join(", ") +
              ")"
            );
          })
          .join(", ");

        const conflictColumns = parsedConstraints.composite[0]
          .map((col) => format("%I", col))
          .join(", ");

        statement = `INSERT INTO ${tableIdentifier} (${columnNames}) VALUES ${valuePlaceholders} ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updateClause.replace(
          /s\./g,
          "EXCLUDED."
        )} RETURNING *`;
      } else if (
        parsedConstraints.simple.length === 1 &&
        parsedConstraints.composite.length === 0
      ) {
        // Single simple constraint - use standard ON CONFLICT with single column
        const valuePlaceholders = valueRows
          .map((row, rowIndex) => {
            return (
              "(" +
              row
                .map((value, colIndex) => {
                  const paramIndex =
                    rowIndex * insertColumns.length + colIndex + 1;
                  const columnName = insertColumns[colIndex];
                  const typeCast = getPostgreSQLTypeCast(columnName, value);
                  return `$${paramIndex}${typeCast}`;
                })
                .join(", ") +
              ")"
            );
          })
          .join(", ");

        const conflictColumn = format("%I", parsedConstraints.simple[0]);
        statement = `INSERT INTO ${tableIdentifier} (${columnNames}) VALUES ${valuePlaceholders} ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateClause.replace(
          /s\./g,
          "EXCLUDED."
        )} RETURNING *`;
      } else if (valueRows.length === 1) {
        // Multiple constraints with single row - use MERGE-like approach with CTE
        const row = valueRows[0];
        const valuesList = insertColumns
          .map((col, idx) => {
            const paramIndex = idx + 1;
            const value = row[idx];
            const typeCast = getPostgreSQLTypeCast(col, value);
            return `$${paramIndex}${typeCast} AS ${format("%I", col)}`;
          })
          .join(", ");

        // Build WHERE conditions for matching existing records
        const matchConditions = [];

        // Add composite constraint conditions
        parsedConstraints.composite.forEach((compositeConstraint) => {
          const condition = compositeConstraint
            .map((key) => `t.${format("%I", key)} = s.${format("%I", key)}`)
            .join(" AND ");
          matchConditions.push(`(${condition})`);
        });

        // Add simple constraint conditions
        parsedConstraints.simple.forEach((simpleConstraint) => {
          matchConditions.push(
            `t.${format("%I", simpleConstraint)} = s.${format(
              "%I",
              simpleConstraint
            )}`
          );
        });

        const combinedConditions = matchConditions.join(" OR ");

        // Use the first constraint (composite or simple) for the final ON CONFLICT clause
        const primaryConstraint =
          parsedConstraints.composite.length > 0
            ? parsedConstraints.composite[0]
                .map((col) => format("%I", col))
                .join(", ")
            : format("%I", parsedConstraints.simple[0]);

        statement = `
          WITH source_data AS (
            SELECT ${valuesList}
          ),
          upsert AS (
            UPDATE ${tableIdentifier} t
            SET ${updateClause}
            FROM source_data s
            WHERE ${combinedConditions}
            RETURNING t.*
          )
          INSERT INTO ${tableIdentifier} (${columnNames})
          SELECT ${columnNames}
          FROM source_data
          WHERE NOT EXISTS (SELECT 1 FROM upsert)
          ON CONFLICT (${primaryConstraint}) DO UPDATE SET ${updateClause.replace(
          /s\./g,
          "EXCLUDED."
        )}
          RETURNING *
        `
          .replace(/\s+/g, " ")
          .trim();
      } else {
        // Multiple rows with multiple constraints - fallback to first constraint
        const valuePlaceholders = valueRows
          .map((row, rowIndex) => {
            return (
              "(" +
              row
                .map((value, colIndex) => {
                  const paramIndex =
                    rowIndex * insertColumns.length + colIndex + 1;
                  const columnName = insertColumns[colIndex];
                  const typeCast = getPostgreSQLTypeCast(columnName, value);
                  return `$${paramIndex}${typeCast}`;
                })
                .join(", ") +
              ")"
            );
          })
          .join(", ");

        // Use the first constraint for the conflict clause
        const conflictColumn =
          parsedConstraints.composite.length > 0
            ? parsedConstraints.composite[0]
                .map((col) => format("%I", col))
                .join(", ")
            : format("%I", parsedConstraints.simple[0]);

        statement = `INSERT INTO ${tableIdentifier} (${columnNames}) VALUES ${valuePlaceholders} ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateClause.replace(
          /s\./g,
          "EXCLUDED."
        )} RETURNING *`;
      }
    } else {
      // No unique keys, just do a simple insert
      const valuePlaceholders = valueRows
        .map((row, rowIndex) => {
          return (
            "(" +
            row
              .map((value, colIndex) => {
                const paramIndex =
                  rowIndex * insertColumns.length + colIndex + 1;
                const columnName = insertColumns[colIndex];
                const typeCast = getPostgreSQLTypeCast(columnName, value);
                return `$${paramIndex}${typeCast}`;
              })
              .join(", ") +
            ")"
          );
        })
        .join(", ");

      statement = `INSERT INTO ${tableIdentifier} (${columnNames}) VALUES ${valuePlaceholders} RETURNING *`;
    }

    const flatValues = valueRows.flat();
    pool.query(statement, flatValues, function (error, results) {
      if (error) {
        reject(error);
        return;
      }
      resolve(results);
    });
  });
}

function insert(table, data, uniqueKeys = []) {
  return new Promise((resolve, reject) => {
    let array = [];
    const promises = [];
    let count = 0;
    let total = 0;

    if (!isset(data[0])) {
      array.push(data);
    } else {
      array = data;
    }

    // Convert data types to ensure PostgreSQL compatibility
    array = convertDataTypes(array);

    const insertColumns = Object.keys(array[0]);

    // Build VALUES clause for bulk insert
    let valueRows = [];

    for (const [i, v] of Object.entries(array)) {
      if (array.hasOwnProperty(i)) {
        const rowValues = [];
        for (const col of insertColumns) {
          rowValues.push(v[col]);
        }
        valueRows.push(rowValues);
        count++;
        total++;

        if (count > 999) {
          promises.push(executeInsert(table, insertColumns, valueRows));
          valueRows = [];
          count = 0;
        }
      }
    }

    if (count > 0) {
      promises.push(executeInsert(table, insertColumns, valueRows));
    }

    const response = {
      rows: total,
      message:
        (total === 1
          ? `1 ${namify(table)} is `
          : `${total} ${namify(table)}s are `) + "saved",
      type: "success",
    };

    Promise.all(promises)
      .then((results) => {
        try {
          if (
            total === 1 &&
            results[0] &&
            results[0].rows &&
            results[0].rows.length > 0
          ) {
            response["id"] = extractId(results[0].rows[0]);
          }
          resolve(response);
        } catch (err) {
          reject(err);
        }
      })
      .catch((error) => {
        reject({ message: error.message, type: "danger" });
      });
  });
}

function executeInsert(table, insertColumns, valueRows) {
  return new Promise((resolve, reject) => {
    const columnNames = insertColumns
      .map((col) => format("%I", col))
      .join(", ");
    const valuePlaceholders = valueRows
      .map((row, rowIndex) => {
        return (
          "(" +
          row
            .map((value, colIndex) => {
              const paramIndex = rowIndex * insertColumns.length + colIndex + 1;
              const columnName = insertColumns[colIndex];
              const typeCast = getPostgreSQLTypeCast(columnName, value);
              return `$${paramIndex}${typeCast}`;
            })
            .join(", ") +
          ")"
        );
      })
      .join(", ");

    const tableIdentifier = getTableIdentifier(table);
    const statement = `INSERT INTO ${tableIdentifier} (${columnNames}) VALUES ${valuePlaceholders} RETURNING *`;

    const flatValues = valueRows.flat();
    pool.query(statement, flatValues, function (error, results) {
      if (error) {
        reject(error);
        return;
      }
      resolve(results);
    });
  });
}

function isset(obj) {
  return typeof obj !== "undefined";
}

function namify(text) {
  return text
    .replace("_", " ")
    .replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase());
}

/**
 * Parse constraints to separate composite and simple constraints
 * Input: [{tenant_id, user_id}, mapper_id] or ["tenant_id", "user_id"] (legacy)
 * Output: { composite: [["tenant_id", "user_id"]], simple: ["mapper_id"] }
 */
function parseConstraints(uniqueKeys) {
  if (!Array.isArray(uniqueKeys) || uniqueKeys.length === 0) {
    return { composite: [], simple: [] };
  }

  const composite = [];
  const simple = [];

  uniqueKeys.forEach((constraint) => {
    if (Array.isArray(constraint)) {
      // Composite constraint: [tenant_id, user_id]
      composite.push(constraint);
    } else if (typeof constraint === "object" && constraint !== null) {
      // Composite constraint as object: {tenant_id, user_id} - convert to array
      composite.push(Object.keys(constraint));
    } else {
      // Simple constraint: mapper_id
      simple.push(constraint);
    }
  });

  return { composite, simple };
}

/**
 * Flatten all constraints into a single array for backward compatibility
 */
function flattenConstraints(uniqueKeys) {
  const parsed = parseConstraints(uniqueKeys);
  return [...parsed.composite.flat(), ...parsed.simple];
}

// Function to ensure proper PostgreSQL data type conversion
function convertDataTypes(data) {
  if (Array.isArray(data)) {
    return data.map(convertDataTypes);
  }

  if (data && typeof data === "object") {
    const converted = {};
    for (const [key, value] of Object.entries(data)) {
      converted[key] = convertSingleValue(key, value);
    }
    return converted;
  }

  return data;
}

// Configuration for PostgreSQL type casting rules
const TYPE_CAST_RULES = {
  // ID fields - pattern-based detection
  bigint: {
    patterns: ["_id$", "^id$"], // Regex patterns
    valueTypes: ["number", "string"],
  },

  // JSON fields - content-based detection
  jsonb: {
    patterns: ["_json$", "_data$", "_config$", "_meta$"], // Common JSON field patterns
    valueDetector: (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))
        ) {
          try {
            JSON.parse(trimmed);
            return true;
          } catch (e) {
            return false;
          }
        }
      }
      return false;
    },
  },

  // Boolean fields - pattern-based detection
  boolean: {
    patterns: [
      "^is_",
      "^has_",
      "^can_",
      "_flag$",
      "_deleted$",
      "_active$",
      "_enabled$",
    ],
    valueTypes: ["boolean"],
    valueDetector: (value) => {
      return (
        typeof value === "boolean" ||
        (typeof value === "string" && (value === "true" || value === "false"))
      );
    },
  },
};

// Function to add custom type casting rules
function addTypeCastRule(postgresType, rule) {
  TYPE_CAST_RULES[postgresType] = {
    ...TYPE_CAST_RULES[postgresType],
    ...rule,
  };
}

// Function to get current type casting rules (for debugging/inspection)
function getTypeCastRules() {
  return { ...TYPE_CAST_RULES };
}

// Helper function to determine PostgreSQL type cast for SQL queries
function getPostgreSQLTypeCast(columnName, value) {
  if (!columnName) return "";

  for (const [castType, rules] of Object.entries(TYPE_CAST_RULES)) {
    // Check pattern-based rules
    if (rules.patterns) {
      for (const pattern of rules.patterns) {
        const regex = new RegExp(pattern);
        if (regex.test(columnName)) {
          // If value type restrictions exist, check them
          if (rules.valueTypes && !rules.valueTypes.includes(typeof value)) {
            continue;
          }
          return `::${castType}`;
        }
      }
    }

    // Check value-based detection
    if (rules.valueDetector && rules.valueDetector(value)) {
      return `::${castType}`;
    }
  }

  // Default - no casting
  return "";
}

function convertSingleValue(key, value) {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle nested objects/arrays
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "object"
        ? convertDataTypes(item)
        : convertSingleValue("", item)
    );
  }

  if (typeof value === "object") {
    return convertDataTypes(value);
  }

  // Convert based on field patterns and value types
  if (typeof value === "string" && value.trim() !== "") {
    // Convert string booleans to proper booleans
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;

    // Handle JSON strings that were stringified by jsonStringify
    if (
      (value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))
    ) {
      try {
        // Try to parse it back to object/array for proper JSON handling
        const parsed = JSON.parse(value);
        // Keep as JSON string for database JSONB columns
        if (typeof parsed === "object") {
          return value; // Keep as JSON string for database
        }
      } catch (e) {
        // If parsing fails, keep as string
      }
    }

    // ID fields should be integers if they're numeric - critical for PostgreSQL bigint compatibility
    if (key && (key.endsWith("_id") || key === "id")) {
      if (/^\d+$/.test(value)) {
        const num = parseInt(value, 10);
        // For PostgreSQL bigint columns, ensure we return a proper integer
        return num;
      }
    }

    // Handle phone numbers - keep as strings
    if (key && (key.includes("phone") || key.includes("mobile"))) {
      return value; // Keep as string
    }

    // General numeric conversion for integer-like strings
    if (/^-?\d+$/.test(value)) {
      const num = parseInt(value, 10);
      // Check for safe integer range to avoid precision issues
      if (num >= Number.MIN_SAFE_INTEGER && num <= Number.MAX_SAFE_INTEGER) {
        return num;
      } else {
        // For very large numbers, keep as string and let PostgreSQL handle the conversion
        return value;
      }
    }

    // Decimal numbers
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
  }

  // Handle numeric values that come as numbers but need type validation
  if (typeof value === "number") {
    // For ID fields, ensure they're integers (critical for PostgreSQL)
    if (key && (key.endsWith("_id") || key === "id")) {
      return Math.floor(value);
    }
    return value;
  }

  return value;
}

// Helper function to extract ID from a row
function extractId(row) {
  if (!row) return null;

  const keys = Object.keys(row);
  // Look for common ID patterns: id, _id, table_id, etc.
  const idKey =
    keys.find(
      (key) => key === "id" || key.endsWith("_id") || key.includes("id")
    ) || keys[0]; // fallback to first column

  return row[idKey];
}

module.exports = {
  connect,
  get,
  list,
  where,
  query,
  qcount,
  remove,
  upsert,
  change: upsert,
  pool,
  insert,
  formatTableName,
  getTableIdentifier,
  getSchemaConfig,
  convertDataTypes,
  addTypeCastRule,
  getTypeCastRules,
};
