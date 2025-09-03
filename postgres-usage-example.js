// PostgreSQL Configuration Example and Usage

const dbPostgres = require("./src/db-postgres");
const model = require("./src/model");

// Example PostgreSQL connection configuration
const postgresConfig = {
  user: "your_username",
  host: "localhost",
  database: "your_database",
  password: "your_password",
  port: 5432,
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Connect to PostgreSQL
dbPostgres.connect(postgresConfig);

// Example usage with your existing model
const userModel = model(
  dbPostgres,
  "users",
  {
    id: "required|integer",
    name: "required|string",
    email: "required|email",
    age: "integer",
    profile: "object",
  },
  "id", // primary key
  ["email"], // unique columns
  { safeDelete: "deleted" } // soft delete column
);

// Example usage (same as your existing MySQL model)
async function exampleUsage() {
  try {
    // Insert a new user
    const newUser = await userModel.insert({
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      profile: { city: "New York", country: "USA" },
    });
    console.log("Inserted user:", newUser);

    // Find user by ID
    const user = await userModel.byId(newUser.id);
    console.log("Found user:", user);

    // Update user
    const updatedUser = await userModel.update({
      id: newUser.id,
      age: 31,
    });
    console.log("Updated user:", updatedUser);

    // List users with pagination
    const usersList = await userModel.list({
      page: 0,
      size: 10,
      sort: ["name", "-created_at"],
    });
    console.log("Users list:", usersList);

    // Find users with filters
    const filteredUsers = await userModel.find({
      age: { $gte: 25 },
    });
    console.log("Filtered users:", filteredUsers);
  } catch (error) {
    console.error("Error:", error);
  }
}

module.exports = {
  dbPostgres,
  userModel,
  exampleUsage,
};
