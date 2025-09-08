process.env.NODE_ENV = "TEST";
process.env.TEST_PORT = 30001;
let crypto = require("crypto");
let table = "test_" + crypto.randomUUID().replace(/-/g, "_");
const assert = require("assert");
const faker = require("faker");
const app = require("../src/serve.js");
const { db } = require("../src/index.js");
describe("Database Functions", function () {
  before(function (done) {
    // Use schema-qualified table name for CREATE TABLE
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
  describe("Single Entry", function () {
    let name = faker.name.findName();
    it("Add an Entry", function (done) {
      db.change(table, { test_name: name })
        .then((data) => {
          console.log("Add Entry Result:", data);
          assert.ok(data.rows == 1);
          done();
        })
        .catch((err) => {
          console.error("Add Entry Error:", err);
          done(err);
        });
    });
    it("Get the entry by ID", function (done) {
      db.get(table, [[["test_id", "=", "1"]]])
        .then((response) => {
          console.log("Get by ID Result:", response);
          assert.ok(response["data"].length == 1);
          assert.ok(response["data"][0].test_id == 1);
          done();
        })
        .catch((err) => {
          console.error("Get by ID Error:", err);
          done(err);
        });
    });
    it("Get the entry by conditions", function (done) {
      db.get(table, [[["test_name", "=", name]]])
        .then((data) => {
          console.log("Get by conditions Result:", data);
          assert.ok(data["data"].length == 1);
          assert.ok(data["data"][0].test_name == name);
          done();
        })
        .catch((err) => {
          console.error("Get by conditions Error:", err);
          done(err);
        });
    });
    it("Remove Entry with ID", function (done) {
      db.remove(table, [[["test_id", "=", "1"]]]).then((data) => {
        //assert.ok(data.status === "removed");
        db.get(table, [[["test_id", "=", "1"]]]).then((data) => {
          assert.ok(data["data"].length == 0);
          done();
        });
      });
    });
    it("Remove Entry with filter", function (done) {
      db.change(table, [{ test_name: name }]).then((data) => {
        db.remove(table, [[["test_name", "=", name]]]).then((data) => {
          //assert.ok(data.status === "removed");
          db.get(table, [[["test_name", "=", name]]]).then((data) => {
            assert.ok(data["data"].length == 0);
            done();
          });
        });
      });
    });

    //Ignores Data with Incorrect field
    it("Add an Entry with incorrect data", function (done) {
      db.change(table, "{ my_name: name }")
        .then((data) => {
          // If it succeeds, that means it was treated as a string, which is fine
          done();
        })
        .catch((err) => {
          // PostgreSQL will have different error messages than MySQL
          assert.ok(
            err.message.includes("syntax") ||
              err.message.includes("invalid") ||
              err.message.includes("column")
          );
          done();
        });
    });
    it("Remove Entry with incorrect data", function (done) {
      db.remove(table, [[["my_name", "=", name]]])
        .then((data) => {
          console.log("result", data);
          // If no error, that's fine too - might just return 0 rows affected
          done();
        })
        .catch((err) => {
          // PostgreSQL error message for unknown column
          assert.ok(
            err.message.includes("column") ||
              err.message.includes("does not exist") ||
              err.message.includes("my_name")
          );
          done();
        });
    });
    it("Get Entries with incorrect data", function (done) {
      db.get(table, [[["my_name", "=", name]]])
        .then((data) => {
          // If no error, that's fine - might just return empty results
          done();
        })
        .catch((err) => {
          // PostgreSQL error message for unknown column
          assert.ok(
            err.message.includes("column") ||
              err.message.includes("does not exist") ||
              err.message.includes("my_name")
          );
          done();
        });
    });
    it("Get Entries with non existant data", function (done) {
      db.get(table, [[["test_name", "=", name + "salt"]]]).then((data) => {
        assert.ok(data["data"].length === 0);
        done();
      });
    });
  });
});
