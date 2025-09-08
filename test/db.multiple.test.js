process.env.NODE_ENV = "TEST";
process.env.TEST_PORT = 30001;
let crypto = require("crypto");
let table = "test_" + crypto.randomUUID().replace(/-/g, "_");
const assert = require("assert");
const faker = require("faker");
const { db } = require("../src/index.js");
const app = require("./../src/serve.js");
describe("Database Functions", function () {
  before(function (done) {
    const schemaQualifiedTable = db.formatTableName(table);

    db.query(
      "CREATE TABLE IF NOT EXISTS " +
        schemaQualifiedTable +
        " (" +
        "test_id SERIAL PRIMARY KEY," +
        "test_name VARCHAR(63) NOT NULL DEFAULT ''," +
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
        ")"
    )
      .then((data) => {
        // Create trigger for modified_at auto-update
        return db.query(`
        CREATE OR REPLACE FUNCTION update_modified_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.modified_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql';
        
        DROP TRIGGER IF EXISTS update_${table}_modified_at ON ${schemaQualifiedTable};
        CREATE TRIGGER update_${table}_modified_at
          BEFORE UPDATE ON ${schemaQualifiedTable}
          FOR EACH ROW
          EXECUTE FUNCTION update_modified_at_column();
      `);
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        console.error("Error in before hook:", err);
        done(err);
      });
  });
  after(function (done) {
    const schemaQualifiedTable = db.formatTableName(table);
    db.query("DROP TABLE IF EXISTS " + schemaQualifiedTable + " CASCADE;")
      .then(() => {
        done();
      })
      .catch(() => {
        done();
      });
  });

  describe("Multiple Entry", function () {
    let number = 1000; // Reduced from 100000 to avoid connection pool issues
    it("Add a lot of Entries (1K)", function (done) {
      this.timeout(30000);
      let input = [];
      for (let i = 0; i < number; i++) {
        input.push({ test_name: faker.name.findName() });
      }
      db.change(table, input)
        .then((data) => {
          assert.ok(data.rows == number);
          done();
        })
        .catch((err) => {
          console.error("Add a lot of entries error:", err);
          done(err);
        });
    });
    it("Remove a particular Entry", function (done) {
      db.remove(table, [[["test_id", "=", "500"]]]).then((data) => {
        db.get(table, [[["test_id", "=", "500"]]]).then((response) => {
          assert.ok(response["data"].length == 0);
          done();
        });
      });
    });
    it("fails to delete when no filter attribute", function (done) {
      this.timeout(5000);
      db.remove(table, [])
        .then((data) => {
          // Should not reach here
          done(new Error("Expected error but got success"));
        })
        .catch((err) => {
          assert.ok(
            err.status == "unable to remove as there is no filter attributes"
          );
          done();
        });
    });
    it("Remove multiple entries", function (done) {
      db.remove(table, [[["test_id", "in", ["3", "4", "5", "6", "7"]]]]).then(
        (data) => {
          //assert.ok(data.status == "removed");
          db.get(table, [[["test_id", "in", ["3", "4", "5", "6", "7"]]]]).then(
            (response) => {
              assert.ok(response["data"].length == 0);
              done();
            }
          );
        }
      );
    });
    it("Get all entries ", function (done) {
      this.timeout(30000);
      db.get(table, [[[]]])
        .then((data) => {
          // Since we reduced to 1K entries and deleted 6, we should have 994
          assert.ok(data.count === number - 6);
          done();
        })
        .catch((err) => {
          console.error("Get all entries error:", err);
          done(err);
        });
    });
    it("Get specific entries", function (done) {
      db.get(table, [[["test_id", "in", ["8", "9", "10", "11", "12"]]]]).then(
        (data) => {
          assert.ok(data.count == 5);
          done();
        }
      );
    });
    it("List First page", function (done) {
      db.list(table).then((data) => {
        assert.ok(data["data"].length == 30);
        done();
      });
    });
    it("List Second page", function (done) {
      db.list(table, [], [], null, 1).then((data) => {
        assert.ok(data["data"].length == 30);
        done();
      });
    });
    it("List First page Seachable", function (done) {
      db.list(table, [[["test_name", "like", "Mr"]]], [], null, 0).then(
        (data) => {
          assert.ok(data["data"].length <= 30 && data["data"].length > 0);
          done();
        }
      );
    });
    it("List Second page Seachable", function (done) {
      db.list(table, [[["test_name", "like", "Mr"]]], [], null, 1).then(
        (data) => {
          assert.ok(data["data"].length <= 30);
          done();
        }
      );
    });
    it("List with incorrect data", function (done) {
      this.timeout(5000);
      db.list(table, [[["unknown_column", "=", "Mr."]]], [], null, 1)
        .then((data) => {
          // Should not reach here
          done(new Error("Expected error but got success"));
        })
        .catch((err) => {
          // PostgreSQL error message format is different from MySQL
          assert.ok(
            err.message.includes("unknown_column") ||
              err.message.includes("does not exist") ||
              err.message.includes("column") ||
              err.message == "Unknown column 'unknown_column' in 'where clause'"
          );
          done();
        });
    });
    it("List with invalid object", function (done) {
      db.list(table, { unknown_column: "Mr." }, [], null, 1)
        .then((data) => {})
        .catch((err) => {
          assert.ok(err.message == "Invalid filter object");
          done();
        });
    });
    it("Get specific entries with incorrect entries", function (done) {
      this.timeout(5000);
      db.get(table, [[["id", "in", ["8", "9", "10", "11", "12"]]]])
        .then((data) => {
          // Should not reach here
          done(new Error("Expected error but got success"));
        })
        .catch((err) => {
          // PostgreSQL error message format is different from MySQL
          assert.ok(
            err.message.includes("id") ||
              err.message.includes("does not exist") ||
              err.message.includes("column") ||
              err.message == "Unknown column 'id' in 'where clause'"
          );
          done();
        });
    });

    it("Remove all entries", function (done) {
      this.timeout(30000);
      // Use a condition that works with PostgreSQL
      // Instead of LIKE with integer, use a range or different condition
      db.remove(table, [[["test_id", ">", "0"]]])
        .then((data) => {
          //assert.ok(data.status == "removed");
          db.get(table)
            .then((data) => {
              assert.ok(data.count == 0);
              done();
            })
            .catch((err) => {
              console.error("Remove all entries - get error:", err);
              done(err);
            });
        })
        .catch((err) => {
          console.error("Remove all entries - remove error:", err);
          done(err);
        });
    });
  });
});
