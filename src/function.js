/*function jsonSafeParse(obj) {
  if (typeof obj === "string") {
    try {
      return JSON.parse(obj);
    } catch (err) {
      return obj;
    }
  } else if (typeof obj === "object") {
    for (const i in obj) {
      obj[i] = jsonSafeParse(obj[i]);
    }
    return obj;
  } else {
    return obj;
  }
}*/
function jsonSafeParse(obj) {
  if (typeof obj === "string") {
    try {
      const parsed = JSON.parse(obj, (key, value) => {
        // Convert numbers larger than MAX_SAFE_INTEGER to strings
        if (typeof value === "number" && value > Number.MAX_SAFE_INTEGER) {
          return obj[key].toString();
        }
        return value;
      });
      return parsed;
    } catch (err) {
      return obj;
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const i in obj) {
      obj[i] = jsonSafeParse(obj[i]);
    }
    return obj;
  } else {
    return obj;
  }
}
function jsonStringify(obj) {
  if (typeof obj === "object") {
    if (!Array.isArray(obj)) {
      for (const i in obj) {
        if (typeof obj[i] === "object") {
          if (obj[i] != null) obj[i] = JSON.stringify(obj[i]);
        }
      }
      return obj;
    } else {
      for (const i in obj) {
        if (obj[i] != null) obj[i] = jsonStringify(obj[i]);
      }
      return obj;
    }
  } else {
    return obj;
  }
}

function convertToModelTypes(data, modelStructure) {
  if (Array.isArray(data)) {
    return data.map((item) => convertToModelTypes(item, modelStructure));
  }

  if (!data || typeof data !== "object") {
    return data;
  }

  const converted = {};
  for (const [key, value] of Object.entries(data)) {
    const fieldDefinition = modelStructure[key];
    converted[key] = convertValueByType(value, fieldDefinition, key);
  }

  return converted;
}

function convertValueByType(value, fieldDefinition, key) {
  if (value === null || value === undefined) {
    return value;
  }

  if (!fieldDefinition) {
    // No field definition, use existing logic
    return convertGenericValue(value, key);
  }

  // Parse field definition (could be "required|integer", "string", etc.)
  const types = fieldDefinition
    .split("|")
    .filter((t) => !["required", "optional"].includes(t));
  const primaryType = types[0] || "string";

  switch (primaryType) {
    case "integer":
      if (typeof value === "string" && /^-?\d+$/.test(value)) {
        return parseInt(value, 10);
      }
      if (typeof value === "number") {
        return Math.floor(value);
      }
      return value;

    case "number":
    case "float":
      if (typeof value === "string" && /^-?\d*\.?\d+$/.test(value)) {
        return parseFloat(value);
      }
      return value;

    case "boolean":
      if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
      }
      return value;

    case "object":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      }
      return value;

    case "array":
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : value;
        } catch (e) {
          return value;
        }
      }
      return value;

    case "string":
    default:
      // For phone fields, keep as string even if numeric
      if (key && (key.includes("phone") || key.includes("mobile") || key.includes("account_number"))) {
        return String(value);
      }
      return value;
  }
}

function convertGenericValue(value, key) {
  if (value === null || value === undefined) {
    return value;
  }

  // ID fields should be integers if they're numeric
  if (key && (key.endsWith("_id") || key === "id")) {
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (typeof value === "number") {
      return Math.floor(value);
    }
  }

  // Phone fields should remain as strings
  if (key && (key.includes("phone") || key.includes("mobile") || key.includes("account_number"))) {
    return String(value);
  }

  // General numeric conversion
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  if (typeof value === "string" && /^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // Boolean conversion
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  return value;
}
function getType(obj) {
  if (Array.isArray(obj)) {
    return "array";
  } else if (obj === null || obj === undefined) {
    return "null";
  } else {
    return typeof obj;
  }
}
function empty(obj) {
  return obj === null || obj === undefined || obj === "";
}
function objectSelecter(obj, picker) {
  for (let i of picker) {
    if (obj.hasOwnProperty(i)) {
      obj = obj[i];
    } else {
      return null;
    }
  }
  return obj;
}
module.exports = {
  jsonSafeParse,
  jsonStringify,
  getType,
  empty,
  objectSelecter,
  convertToModelTypes,
  convertValueByType,
  convertGenericValue,
};
