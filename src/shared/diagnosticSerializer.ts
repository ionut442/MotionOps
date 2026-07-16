import type { DiagnosticValue, DiagnosticWarning } from "./diagnostics";

export interface DiagnosticSerializerOptions {
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
}

export interface DiagnosticSerialization {
  value: DiagnosticValue;
  warnings: DiagnosticWarning[];
}

const defaultOptions = {
  maxDepth: 6,
  maxArrayItems: 25,
  maxObjectKeys: 40
} satisfies Required<DiagnosticSerializerOptions>;

const marker = (type: string, details: Record<string, DiagnosticValue> = {}): DiagnosticValue => ({
  __motionOpsType: type,
  ...details
});

const pathFor = (parent: string, segment: string): string =>
  parent === "$" ? `$.${segment}` : `${parent}.${segment}`;

export const serializeDiagnosticValue = (
  input: unknown,
  options: DiagnosticSerializerOptions = {}
): DiagnosticSerialization => {
  const config = { ...defaultOptions, ...options };
  const warnings: DiagnosticWarning[] = [];
  const seen = new WeakSet();

  const walk = (value: unknown, depth: number, path: string): DiagnosticValue => {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value;
    }

    if (value === undefined) {
      return marker("undefined");
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : marker("non-finite-number", { value: String(value) });
    }

    if (typeof value === "bigint") {
      return marker("bigint", { value: value.toString() });
    }

    if (typeof value === "symbol") {
      return marker("symbol", { value: String(value) });
    }

    if (typeof value === "function") {
      return marker("function", { name: value.name || "anonymous" });
    }

    if (typeof value !== "object") {
      return marker("unserializable", { value: Object.prototype.toString.call(value) });
    }

    if (seen.has(value)) {
      warnings.push({ code: "CIRCULAR_REFERENCE", message: "Circular reference skipped.", path });
      return marker("circular-reference");
    }

    if (depth >= config.maxDepth) {
      warnings.push({ code: "MAX_DEPTH", message: "Maximum serialization depth reached.", path });
      return marker("truncated", { reason: "max-depth" });
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const items = value
        .slice(0, config.maxArrayItems)
        .map((item, index) => walk(item, depth + 1, `${path}[${index.toString()}]`));

      if (value.length > config.maxArrayItems) {
        warnings.push({
          code: "ARRAY_TRUNCATED",
          message: `Array truncated from ${value.length.toString()} to ${config.maxArrayItems.toString()} items.`,
          path
        });
        items.push(marker("truncated", { remainingItems: value.length - config.maxArrayItems }));
      }

      seen.delete(value);
      return items;
    }

    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch (error) {
      warnings.push({
        code: "PROPERTY_DISCOVERY_FAILED",
        message: error instanceof Error ? error.message : "Unable to inspect object properties.",
        path
      });
      seen.delete(value);
      return marker("property-discovery-failed");
    }

    const entries = Object.entries(descriptors).filter(([, descriptor]) => descriptor.enumerable);
    const output: Record<string, DiagnosticValue> = {};

    for (const [key, descriptor] of entries.slice(0, config.maxObjectKeys)) {
      const childPath = pathFor(path, key);
      if ("get" in descriptor && typeof descriptor.get === "function") {
        warnings.push({
          code: "ACCESSOR_SKIPPED",
          message: "Accessor property was not executed during diagnostic serialization.",
          path: childPath
        });
        output[key] = marker("accessor-skipped");
        continue;
      }

      try {
        output[key] = walk(descriptor.value, depth + 1, childPath);
      } catch (error) {
        warnings.push({
          code: "PROPERTY_SERIALIZATION_FAILED",
          message: error instanceof Error ? error.message : "Unable to serialize property.",
          path: childPath
        });
        output[key] = marker("property-serialization-failed");
      }
    }

    if (entries.length > config.maxObjectKeys) {
      warnings.push({
        code: "OBJECT_TRUNCATED",
        message: `Object truncated from ${entries.length.toString()} to ${config.maxObjectKeys.toString()} keys.`,
        path
      });
      output.__truncated = true;
      output.__remainingKeys = entries.length - config.maxObjectKeys;
    }

    seen.delete(value);
    return output;
  };

  return {
    value: walk(input, 0, "$"),
    warnings
  };
};
