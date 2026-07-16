import { describe, expect, it } from "vitest";
import { serializeDiagnosticValue } from "../src/shared/diagnosticSerializer";

describe("diagnostic serializer", () => {
  it("serializes nested objects, arrays, unknown fields, and empty Motion data", () => {
    const serialized = serializeDiagnosticValue({
      id: "track-1",
      keyframes: [{ id: "kf-1", time: 0.3, value: { x: 10 } }],
      unknownBetaField: { nested: true },
      emptyMotion: {}
    });

    expect(serialized.value).toMatchObject({
      id: "track-1",
      unknownBetaField: { nested: true },
      emptyMotion: {}
    });
  });

  it("marks circular references", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    const serialized = serializeDiagnosticValue(value);
    expect(JSON.stringify(serialized.value)).toContain("circular-reference");
    expect(serialized.warnings.some((warning) => warning.code === "CIRCULAR_REFERENCE")).toBe(true);
  });

  it("truncates large arrays and objects", () => {
    const largeObject = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [`key${index.toString()}`, index])
    );
    const serialized = serializeDiagnosticValue([1, 2, 3, 4], {
      maxArrayItems: 2,
      maxObjectKeys: 2
    });
    const objectSerialized = serializeDiagnosticValue(largeObject, { maxObjectKeys: 2 });

    expect(JSON.stringify(serialized.value)).toContain("truncated");
    expect(JSON.stringify(objectSerialized.value)).toContain("__truncated");
  });

  it("converts undefined and non-finite numbers consistently", () => {
    const serialized = serializeDiagnosticValue({ missing: undefined, bad: Number.NaN });
    expect(JSON.stringify(serialized.value)).toContain("undefined");
    expect(JSON.stringify(serialized.value)).toContain("non-finite-number");
  });

  it("does not execute getters", () => {
    const value = {
      get dangerous() {
        throw new Error("getter executed");
      }
    };

    const serialized = serializeDiagnosticValue(value);
    expect(JSON.stringify(serialized.value)).toContain("accessor-skipped");
    expect(serialized.warnings.some((warning) => warning.code === "ACCESSOR_SKIPPED")).toBe(true);
  });

  it("reports property discovery errors", () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("cannot inspect");
        }
      }
    );

    const serialized = serializeDiagnosticValue(proxy);
    expect(JSON.stringify(serialized.value)).toContain("property-discovery-failed");
  });
});
