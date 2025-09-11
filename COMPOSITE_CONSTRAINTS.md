# Composite Constraints Documentation

## Overview

The `upsert` and `insert` functions now support composite and simple constraints using an enhanced syntax that allows you to define multi-column unique constraints and single-column unique constraints.

## Constraint Syntax

### 1. Composite Constraints (Array Format)

```javascript
const constraints = [["tenant_id", "user_id"], "mapper_id"];
```

- `["tenant_id", "user_id"]` represents a composite constraint (both columns together form a unique constraint)
- `"mapper_id"` represents a simple constraint (single column unique constraint)

### 2. Composite Constraints (Object Format)

```javascript
const constraints = [{ tenant_id: true, user_id: true }, "mapper_id"];
```

- `{tenant_id: true, user_id: true}` represents a composite constraint using object syntax
- `"mapper_id"` represents a simple constraint

### 3. Legacy Simple Constraints (Backward Compatible)

```javascript
const constraints = ["column1", "column2"];
```

- Each string represents a simple constraint (single column unique constraint)
- This format is still fully supported for backward compatibility

## Examples

### Multi-Tenant Application Example

```javascript
const db = require("./src/db-postgres.js"); // or './src/db.js' for MySQL

// Define constraints: composite (tenant_id, user_id) + simple (mapper_id)
const constraints = [["tenant_id", "user_id"], "mapper_id"];

const userData = {
  tenant_id: 1,
  user_id: 100,
  mapper_id: 1001,
  name: "John Doe",
  email: "john@tenant1.com",
};

// This will insert or update based on the composite constraint
const result = await db.upsert("users", userData, constraints);
```

### Product Catalog Example

```javascript
// Each product has a unique SKU within a category + unique global product_id
const constraints = [["category_id", "sku"], "product_id"];

const productData = {
  category_id: 1,
  sku: "ABC123",
  product_id: 5001,
  name: "Widget A",
  price: 29.99,
};

const result = await db.upsert("products", productData, constraints);
```

### User Permissions Example

```javascript
// Each user can have one role per resource + unique permission_id
const constraints = [["user_id", "resource_id"], "permission_id"];

const permissionData = {
  user_id: 123,
  resource_id: 456,
  permission_id: 789,
  role: "admin",
  granted_at: new Date(),
};

const result = await db.upsert("user_permissions", permissionData, constraints);
```

## Bulk Operations

The composite constraints work with bulk operations as well:

```javascript
const bulkData = [
  {
    tenant_id: 1,
    user_id: 100,
    mapper_id: 1001,
    name: "User 1",
    email: "user1@example.com",
  },
  {
    tenant_id: 1,
    user_id: 101,
    mapper_id: 1002,
    name: "User 2",
    email: "user2@example.com",
  },
];

const constraints = [["tenant_id", "user_id"], "mapper_id"];
const result = await db.upsert("users", bulkData, constraints);
```

## Database Compatibility

### PostgreSQL

- Uses `ON CONFLICT` clauses with composite keys: `ON CONFLICT (tenant_id, user_id)`
- Supports multiple constraint scenarios using CTE (Common Table Expressions) for complex cases
- Handles both single and bulk operations efficiently

### MySQL

- Uses `ON DUPLICATE KEY UPDATE` with flattened constraint processing
- Maintains backward compatibility with existing constraint logic
- Processes composite constraints by flattening them for the underlying MySQL operations

## Migration from Legacy Format

### Before (Legacy)

```javascript
// Old way - only simple constraints
const constraints = ["tenant_id", "user_id", "mapper_id"];
await db.upsert("users", userData, constraints);
```

### After (New Composite Syntax)

```javascript
// New way - composite + simple constraints
const constraints = [["tenant_id", "user_id"], "mapper_id"];
await db.upsert("users", userData, constraints);
```

## Error Handling

If you specify constraints that don't exist as unique constraints in your database schema, you'll get appropriate error messages:

```javascript
// PostgreSQL error example
{
  message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
  type: "danger"
}

// MySQL error example
{
  message: "Duplicate entry '...' for key '...'",
  type: "danger"
}
```

## Best Practices

1. **Define Database Constraints First**: Ensure your database table has the appropriate unique constraints defined before using them in your code.

2. **Use Composite Constraints for Logical Groupings**: Use composite constraints when multiple columns together should be unique, such as `(tenant_id, user_id)` in multi-tenant applications.

3. **Combine with Simple Constraints**: You can mix composite and simple constraints in the same operation.

4. **Test Your Constraints**: Always test your constraint definitions with your actual database schema.

5. **Consider Performance**: Composite constraints can affect query performance, so ensure your database has appropriate indexes.

## Implementation Details

The implementation adds new helper functions:

- `parseConstraints(uniqueKeys)`: Parses the constraint syntax and separates composite from simple constraints
- `flattenConstraints(uniqueKeys)`: Flattens all constraints for backward compatibility
- Enhanced `executeUpsert()` function that handles different constraint scenarios

The changes are fully backward compatible - existing code using the legacy simple constraint format will continue to work without any modifications.
