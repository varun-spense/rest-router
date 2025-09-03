// PostgreSQL Strategy for Dynamic Column/Table Names

const { Pool } = require("pg");

// Helper function to safely quote PostgreSQL identifiers
function quoteIdentifier(name) {
  if (typeof name !== "string") {
    throw new Error("Identifier must be a string");
  }
  // Escape double quotes and wrap in double quotes
  return '"' + name.replace(/"/g, '""') + '"';
}

// Helper function to build parameterized queries
function buildParameterizedQuery(template, identifiers = [], values = []) {
  let query = template;
  let paramIndex = 1;

  // Replace ?? with quoted identifiers (these don't count as parameters)
  for (const identifier of identifiers) {
    query = query.replace("??", quoteIdentifier(identifier));
  }

  // Replace ? with $1, $2, etc. for values
  const finalQuery = query.replace(/\?/g, () => `$${paramIndex++}`);

  return {
    query: finalQuery,
    values: values,
  };
}

// Example: Rewriting your sort_builder function
function sort_builder(sort) {
  if (sort.length < 1) {
    return {
      query: "",
      identifiers: [],
      values: [],
    };
  }

  let query_items = [];
  let identifiers = [];

  for (const item of sort) {
    if (item[0] === "-") {
      query_items.push("?? DESC");
      identifiers.push(item.replace("-", ""));
    } else {
      query_items.push("?? ASC");
      identifiers.push(item);
    }
  }

  let query = "ORDER BY " + query_items.join(",");
  return {
    query,
    identifiers,
    values: [], // No parameter values in ORDER BY, just identifiers
  };
}

// Example: Rewriting your where function
function where(filter, safeDelete = null) {
  // ... existing validation logic ...

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
  let identifiers = [];
  let values = [];

  for (const i of filter) {
    let conditionAnd = [];
    for (const j of i) {
      if (!valid_conditionals.includes(j[1])) {
        return null;
      }

      if (j[1] === "in" || j[1] === "not in") {
        // Build: column_name IN ($1, $2, $3)
        const placeholders = j[2]
          .map((_, idx) => `$${values.length + idx + 1}`)
          .join(", ");
        conditionAnd.push(`?? ${j[1]} (${placeholders})`);
        identifiers.push(j[0]); // column name
        values.push(...j[2]); // values for IN clause
      } else if (j[1] === "like" || j[1] === "not like") {
        conditionAnd.push(`?? ${j[1]} ?`);
        identifiers.push(j[0]); // column name
        values.push("%" + j[2] + "%"); // value with wildcards
      } else {
        conditionAnd.push(`?? ${j[1]} ?`);
        identifiers.push(j[0]); // column name
        values.push(j[2]); // value
      }
    }
    conditionOr.push(conditionAnd.join(" AND "));
  }

  let query = "WHERE ((" + conditionOr.join(") OR (") + "))";
  return {
    query,
    identifiers,
    values,
  };
}

// Example: Rewriting your get function
function get(table, filter = [], sort = [], safeDelete = null) {
  return new Promise((resolve, reject) => {
    const whereData = where(filter, safeDelete);
    const sortData = sort_builder(sort);

    // Build the complete query
    const template = `SELECT * FROM ?? ${whereData.query} ${sortData.query}`;
    const allIdentifiers = [
      table,
      ...whereData.identifiers,
      ...sortData.identifiers,
    ];
    const allValues = [...whereData.values, ...sortData.values];

    const { query: finalQuery, values: finalValues } = buildParameterizedQuery(
      template,
      allIdentifiers,
      allValues
    );

    pool.query(finalQuery, finalValues, (error, results) => {
      if (error) {
        reject({ message: error.message });
        return;
      }

      const response = {
        data: results.rows, // PostgreSQL uses .rows instead of direct results
        count: results.rowCount,
      };
      resolve(response);
    });
  });
}

// Example usage:
const sortExample = sort_builder(["name", "-created_at"]);
console.log("Sort example:", sortExample);
// Output: { query: "ORDER BY ?? ASC,?? DESC", identifiers: ['name', 'created_at'], values: [] }

const whereExample = where([
  [
    ["name", "=", "John"],
    ["age", ">", 18],
  ],
]);
console.log("Where example:", whereExample);
// Output: { query: "WHERE ((? = ? AND ? > ?))", identifiers: ['name', 'age'], values: ['John', 18] }

module.exports = {
  quoteIdentifier,
  buildParameterizedQuery,
  sort_builder,
  where,
  get,
};
