const { Pool } = require("pg");
const format = require("pg-format");
const { jsonSafeParse } = require("./function");

let pool = null;
const WHERE_INVALID = "Invalid filter object";

function connect(credentials) {
  pool = new Pool(credentials);
  return pool;
}

function query(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, parameters, function (error, results) {
      if (error) {
        reject(error);
      }
      resolve(results);
    });
  });
}

function sort_builder(sort) {
  if (sort.length < 1) {
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
  return {
    query,
    values,
  };
}

function get(table, filter = [], sort = [], safeDelete = null) {
  const response = {};
  return new Promise((resolve, reject) => {
    if (safeDelete !== null) {
      for (const filterItem of filter) {
        filterItem.push([safeDelete, "=", 0]);
      }
    }

    const whereData = where(filter, safeDelete);
    const sortData = sort_builder(sort);

    if (whereData === null) {
      reject({ message: WHERE_INVALID });
      return;
    }

    const statement = format(
      "SELECT * FROM %I %s %s",
      table,
      whereData.query,
      sortData.query
    );
    const allValues = [...whereData.values, ...sortData.values];

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

    const statement = format(
      "SELECT * FROM %I %s %s LIMIT $%s OFFSET $%s",
      table,
      whereData.query,
      sortData.query,
      whereData.values.length + 1,
      whereData.values.length + 2
    );

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
  return new Promise((resolve, reject) => {
    const whereData = where(filter, safeDelete);
    if (whereData == null) {
      reject({ message: WHERE_INVALID });
      return;
    }

    const statement = format(
      "SELECT count(*) AS number FROM %I %s",
      table,
      whereData.query
    );

    pool.query(statement, whereData.values, function (error, results) {
      if (error || results === "undefined") {
        resolve(0);
      } else {
        resolve(parseInt(results.rows[0].number));
      }
    });
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
      statement = format(
        "UPDATE %I SET %I = $%s %s",
        table,
        safeDelete,
        whereData.values.length + 1,
        whereData.query
      );
      values = [...whereData.values, 1];
    } else {
      statement = format("DELETE FROM %I %s", table, whereData.query);
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

    const insertColumns = Object.keys(array[0]);
    const updateColumns = insertColumns.filter(
      (col) => !uniqueKeys.includes(col)
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
              uniqueKeys,
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
          uniqueKeys,
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
  uniqueKeys,
  valueRows
) {
  return new Promise((resolve, reject) => {
    // Build the INSERT ... ON CONFLICT statement
    const columnNames = insertColumns
      .map((col) => format("%I", col))
      .join(", ");
    const valuePlaceholders = valueRows
      .map((row, rowIndex) => {
        return (
          "(" +
          row
            .map(
              (_, colIndex) =>
                `$${rowIndex * insertColumns.length + colIndex + 1}`
            )
            .join(", ") +
          ")"
        );
      })
      .join(", ");

    const conflictColumns = uniqueKeys
      .map((col) => format("%I", col))
      .join(", ");

    let statement;
    if (uniqueKeys.length > 0) {
      const updateClause =
        updateColumns.length > 0
          ? updateColumns
              .map((col) => format("%I = EXCLUDED.%I", col, col))
              .join(", ")
          : format("%I = EXCLUDED.%I", insertColumns[0], insertColumns[0]); // fallback if no update columns

      statement = format(
        "INSERT INTO %I (%s) VALUES %s ON CONFLICT (%s) DO UPDATE SET %s RETURNING *",
        table,
        columnNames,
        valuePlaceholders,
        conflictColumns,
        updateClause
      );
    } else {
      // No unique keys, just do a simple insert
      statement = format(
        "INSERT INTO %I (%s) VALUES %s RETURNING *",
        table,
        columnNames,
        valuePlaceholders
      );
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
            .map(
              (_, colIndex) =>
                `$${rowIndex * insertColumns.length + colIndex + 1}`
            )
            .join(", ") +
          ")"
        );
      })
      .join(", ");

    const statement = format(
      "INSERT INTO %I (%s) VALUES %s RETURNING *",
      table,
      columnNames,
      valuePlaceholders
    );

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
};
