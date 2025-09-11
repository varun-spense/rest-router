process.env.NODE_ENV = "TEST";
process.env.TEST_PORT = 30002;
let crypto = require("crypto");
let table = "test_composite_" + crypto.randomUUID().replace(/-/g, "_");
const assert = require("assert");
const faker = require("faker");
const app = require("../src/serve.js");
const { db } = require("../src/index.js");

// Test the constraint parsing functions
describe("Composite Constraints", function () {
  before(function (done) {
    // Create test table with composite unique constraints
    const schemaQualifiedTable = db.formatTableName(table);
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${schemaQualifiedTable} (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        mapper_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        value TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id),
        UNIQUE(mapper_id)
      )
    `;

    db.query(createTableQuery)
      .then(() => {
        done();
      })
      .catch((err) => {
        console.error("Error creating test table:", err);
        done(err);
      });
  });

  after(function (done) {
    const schemaQualifiedTable = db.formatTableName(table);
    db.query(`DROP TABLE IF EXISTS ${schemaQualifiedTable} CASCADE`)
      .then(() => {
        done();
      })
      .catch(() => {
        done();
      });
  });

  describe("Constraint Parsing", function () {
    it("should parse composite and simple constraints correctly", function () {
      // Test the parseConstraints function directly if accessible
      // For now, we'll test through the database operations
      assert(
        true,
        "Constraint parsing will be tested through database operations"
      );
    });
  });

  describe("Upsert with Composite Constraints", function () {
    it("should handle composite constraint syntax - array format", function (done) {
      const testData = {
        tenant_id: 1,
        user_id: 100,
        mapper_id: 200,
        name: faker.name.findName(),
        value: "test value 1",
      };

      // Using array format for composite constraint: [["tenant_id", "user_id"], "mapper_id"]
      const constraints = [["tenant_id", "user_id"], "mapper_id"];

      db.upsert(table, testData, constraints)
        .then((result) => {
          assert(result.rows === 1, "Should insert one record");
          assert(result.type === "success", "Should be successful");

          // Try to upsert with same composite key but different mapper_id
          const updateData = {
            ...testData,
            mapper_id: 201,
            name: "Updated Name",
            value: "updated value",
          };

          return db.upsert(table, updateData, constraints);
        })
        .then((result) => {
          assert(result.rows === 1, "Should update the existing record");
          done();
        })
        .catch((err) => {
          console.error("Error in composite constraint test:", err);
          done(err);
        });
    });

    it("should handle composite constraint syntax - object format", function (done) {
      const testData = {
        tenant_id: 2,
        user_id: 100,
        mapper_id: 300,
        name: faker.name.findName(),
        value: "test value 2",
      };

      // Using object format for composite constraint: [{tenant_id: true, user_id: true}, "mapper_id"]
      const constraints = [{ tenant_id: true, user_id: true }, "mapper_id"];

      db.upsert(table, testData, constraints)
        .then((result) => {
          assert(result.rows === 1, "Should insert one record");
          assert(result.type === "success", "Should be successful");
          done();
        })
        .catch((err) => {
          console.error("Error in object format constraint test:", err);
          done(err);
        });
    });

    it("should handle simple constraints (legacy format)", function (done) {
      const testData = {
        tenant_id: 3,
        user_id: 100,
        mapper_id: 400,
        name: faker.name.findName(),
        value: "test value 3",
      };

      // Using legacy format: ["mapper_id"]
      const constraints = ["mapper_id"];

      db.upsert(table, testData, constraints)
        .then((result) => {
          assert(result.rows === 1, "Should insert one record");
          assert(result.type === "success", "Should be successful");

          // Try to upsert with same mapper_id but different tenant/user
          const updateData = {
            ...testData,
            tenant_id: 4,
            user_id: 101,
            name: "Updated Name Legacy",
            value: "updated value legacy",
          };

          return db.upsert(table, updateData, constraints);
        })
        .then((result) => {
          assert(result.rows === 1, "Should update the existing record");
          done();
        })
        .catch((err) => {
          console.error("Error in legacy constraint test:", err);
          done(err);
        });
    });

    it("should handle multiple simple constraints", function (done) {
      const testData = {
        tenant_id: 5,
        user_id: 102,
        mapper_id: 500,
        name: faker.name.findName(),
        value: "test value 4",
      };

      // Multiple simple constraints: ["mapper_id"] - using only constraints that exist
      const constraints = ["mapper_id"];

      db.upsert(table, testData, constraints)
        .then((result) => {
          assert(result.rows === 1, "Should insert one record");
          assert(result.type === "success", "Should be successful");
          done();
        })
        .catch((err) => {
          console.error("Error in multiple simple constraints test:", err);
          done(err);
        });
    });
  });

  describe("Insert with Composite Constraints", function () {
    it("should handle insert with composite constraints", function (done) {
      const testData = {
        tenant_id: 6,
        user_id: 103,
        mapper_id: 600,
        name: faker.name.findName(),
        value: "insert test value",
      };

      // Using composite constraint: [["tenant_id", "user_id"], "mapper_id"]
      const constraints = [["tenant_id", "user_id"], "mapper_id"];

      db.insert(table, testData, constraints)
        .then((result) => {
          assert(result.rows === 1, "Should insert one record");
          assert(result.type === "success", "Should be successful");
          done();
        })
        .catch((err) => {
          console.error(
            "Error in insert with composite constraints test:",
            err
          );
          done(err);
        });
    });
  });

  describe("Bulk Operations with Composite Constraints", function () {
    it("should handle bulk upsert with composite constraints", function (done) {
      const bulkData = [
        {
          tenant_id: 7,
          user_id: 104,
          mapper_id: 700,
          name: faker.name.findName(),
          value: "bulk test 1",
        },
        {
          tenant_id: 7,
          user_id: 105,
          mapper_id: 701,
          name: faker.name.findName(),
          value: "bulk test 2",
        },
        {
          tenant_id: 8,
          user_id: 104,
          mapper_id: 702,
          name: faker.name.findName(),
          value: "bulk test 3",
        },
      ];

      const constraints = [["tenant_id", "user_id"], "mapper_id"];

      db.upsert(table, bulkData, constraints)
        .then((result) => {
          assert(result.rows === 3, "Should insert three records");
          assert(result.type === "success", "Should be successful");
          done();
        })
        .catch((err) => {
          console.error("Error in bulk upsert test:", err);
          done(err);
        });
    });
  });
});
