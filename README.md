# pg-model-router

Generative API Creation using pg and express libraries in node js

## New Feature: Composite Constraints

The `upsert` and `insert` functions now support composite constraints using enhanced syntax:

```javascript
// Composite constraint syntax: [["tenant_id", "user_id"], "mapper_id"]
// - ["tenant_id", "user_id"] = composite constraint (both columns together)
// - "mapper_id" = simple constraint (single column)

const constraints = [["tenant_id", "user_id"], "mapper_id"];
await db.upsert("users", userData, constraints);
```

See [COMPOSITE_CONSTRAINTS.md](./COMPOSITE_CONSTRAINTS.md) for detailed documentation.

## Basic Usage

```
const { db, model,route } = require("mysql-model-router");
db.connect({
  connectionLimit: 100,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  charset: "utf8mb4",
});

let test = model( db,
  "test", //table name
  {//table data structure
    test_id: "required|integer",
    user_id: "required|integer",
    name: "required|string",
    description: "required|string",
    type: "required|integer",
    info: "required|object",
    is_deleted: "boolean"
  },
  "test_id",//primary key/ auto increment key
  [],//array of columns which makes the row unique
  { safeDelete: "is_deleted" }//column used to declare safe delete option
  )
app.use("/test", route(test),{"user_id":"session.user.user_id"}); // create 8 endpoints with overides to filter data based on user_id,tenant_id from request session

Induvidual
GET /:id
POST /:id
PUT /:id
DELETE /:id

Bulk
GET /
POST /
PUT /
DELETE /
```

/\*
filter=[[["column_name",condition","value],["column_name","condition","value"]],[["column_name",condition","value],["column_name","condition","value]]]
conditions to support
=,like,in,<,>,<=,>=,!=

1st Array is OR
2nd Array is AND
3rd Array is Conditional

\*/

```
/module/test.js
const {route,model} = require("./index.js");
const testModel = model(db,
    "test",
    {
      test_id: "INTEGER",
      name: "STRING",
      description: "STRING",
      type: "INTEGER",
      info: "JSON",
    },
    "test_id",
    "name",
    [],
    {
      session: ["user"]["user_id"],
    });
    model["customFunction"] = async (a,b,c) =>{

    };
    const testRoute =route(db,
        "test",
        {
          test_id: "INTEGER",
          name: "STRING",
          description: "STRING",
          type: "INTEGER",
          info: "JSON",
        },
        "test_id",
        "name",
        [],
        {
          session: ["user"]["user_id"],
        });
        testRoute.post("/",(req,res)=>{

        })
module.exports = {route:testRoute,model:testModel };
```
