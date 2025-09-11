/**
 * Example demonstrating composite and simple constraints in upsert and insert operations
 *
 * Constraint Syntax:
 * - Simple constraints: ["column1", "column2"] (legacy format, still supported)
 * - Composite constraints: [["col1", "col2"], "col3"] (array format)
 * - Composite constraints: [{col1: true, col2: true}, "col3"] (object format)
 *
 * In the example [{tenant_id, user_id}, mapper_id]:
 * - {tenant_id, user_id} represents a composite constraint (both columns together form a unique constraint)
 * - mapper_id represents a simple constraint (single column unique constraint)
 */

const db = require("./src/db-postgres.js"); // or './src/db.js' for MySQL

async function demonstrateCompositeConstraints() {
  console.log("=== Composite Constraints Demo ===\n");

  // Example 1: Using array format for composite constraints
  console.log('1. Array format: [["tenant_id", "user_id"], "mapper_id"]');
  const constraintsArray = [["tenant_id", "user_id"], "mapper_id"];

  const userData1 = {
    tenant_id: 1,
    user_id: 100,
    mapper_id: 200,
    name: "John Doe",
    email: "john@example.com",
  };

  try {
    let result = await db.upsert("users", userData1, constraintsArray);
    console.log("Insert result:", result);

    // Update with same composite key (tenant_id, user_id) but different mapper_id
    const updateData1 = {
      ...userData1,
      mapper_id: 201, // Different mapper_id
      name: "John Doe Updated",
      email: "john.updated@example.com",
    };

    result = await db.upsert("users", updateData1, constraintsArray);
    console.log("Update result:", result);
  } catch (error) {
    console.error("Error with array format:", error.message);
  }

  console.log("\n---\n");

  // Example 2: Using object format for composite constraints
  console.log(
    '2. Object format: [{tenant_id: true, user_id: true}, "mapper_id"]'
  );
  const constraintsObject = [{ tenant_id: true, user_id: true }, "mapper_id"];

  const userData2 = {
    tenant_id: 2,
    user_id: 100,
    mapper_id: 300,
    name: "Jane Smith",
    email: "jane@example.com",
  };

  try {
    const result = await db.upsert("users", userData2, constraintsObject);
    console.log("Insert result:", result);
  } catch (error) {
    console.error("Error with object format:", error.message);
  }

  console.log("\n---\n");

  // Example 3: Legacy simple constraints (backward compatibility)
  console.log('3. Legacy format: ["mapper_id"]');
  const constraintsLegacy = ["mapper_id"];

  const userData3 = {
    tenant_id: 3,
    user_id: 100,
    mapper_id: 400,
    name: "Bob Wilson",
    email: "bob@example.com",
  };

  try {
    let result = await db.upsert("users", userData3, constraintsLegacy);
    console.log("Insert result:", result);

    // Update with same mapper_id but different tenant_id and user_id
    const updateData3 = {
      ...userData3,
      tenant_id: 4, // Different tenant_id
      user_id: 101, // Different user_id
      name: "Bob Wilson Updated",
      email: "bob.updated@example.com",
    };

    result = await db.upsert("users", updateData3, constraintsLegacy);
    console.log("Update result:", result);
  } catch (error) {
    console.error("Error with legacy format:", error.message);
  }

  console.log("\n---\n");

  // Example 4: Multiple simple constraints
  console.log('4. Multiple simple constraints: ["tenant_id", "mapper_id"]');
  const multipleSimple = ["tenant_id", "mapper_id"];

  const userData4 = {
    tenant_id: 5,
    user_id: 102,
    mapper_id: 500,
    name: "Alice Brown",
    email: "alice@example.com",
  };

  try {
    const result = await db.upsert("users", userData4, multipleSimple);
    console.log("Insert result:", result);
  } catch (error) {
    console.error("Error with multiple simple constraints:", error.message);
  }

  console.log("\n---\n");

  // Example 5: Bulk operations with composite constraints
  console.log("5. Bulk upsert with composite constraints");
  const bulkData = [
    {
      tenant_id: 6,
      user_id: 103,
      mapper_id: 600,
      name: "User 1",
      email: "user1@example.com",
    },
    {
      tenant_id: 6,
      user_id: 104,
      mapper_id: 601,
      name: "User 2",
      email: "user2@example.com",
    },
    {
      tenant_id: 7,
      user_id: 103,
      mapper_id: 602,
      name: "User 3",
      email: "user3@example.com",
    },
  ];

  try {
    const result = await db.upsert("users", bulkData, constraintsArray);
    console.log("Bulk upsert result:", result);
  } catch (error) {
    console.error("Error with bulk upsert:", error.message);
  }

  console.log("\n=== Demo Complete ===");
}

// Usage examples for different scenarios:

/**
 * Scenario 1: Multi-tenant application
 * - Each tenant can have users with the same user_id
 * - But within a tenant, user_id must be unique
 * - Each user also has a unique global mapper_id
 */
function multiTenantExample() {
  const constraints = [["tenant_id", "user_id"], "mapper_id"];

  return db.upsert(
    "users",
    {
      tenant_id: 1,
      user_id: 100,
      mapper_id: 1001,
      name: "John Doe",
      email: "john@tenant1.com",
    },
    constraints
  );
}

/**
 * Scenario 2: Product catalog with SKU constraints
 * - Each product has a unique SKU within a category
 * - Each product also has a unique global product_id
 */
function productCatalogExample() {
  const constraints = [["category_id", "sku"], "product_id"];

  return db.upsert(
    "products",
    {
      category_id: 1,
      sku: "ABC123",
      product_id: 5001,
      name: "Widget A",
      price: 29.99,
    },
    constraints
  );
}

/**
 * Scenario 3: User permissions with role constraints
 * - Each user can have one role per resource
 * - Each permission record has a unique global permission_id
 */
function userPermissionsExample() {
  const constraints = [["user_id", "resource_id"], "permission_id"];

  return db.upsert(
    "user_permissions",
    {
      user_id: 123,
      resource_id: 456,
      permission_id: 789,
      role: "admin",
      granted_at: new Date(),
    },
    constraints
  );
}

module.exports = {
  demonstrateCompositeConstraints,
  multiTenantExample,
  productCatalogExample,
  userPermissionsExample,
};

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateCompositeConstraints().catch(console.error);
}
