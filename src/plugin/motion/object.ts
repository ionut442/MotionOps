export type UnknownRecord = Record<string, unknown>;

export const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" ? (value as UnknownRecord) : null;

export const getString = (record: UnknownRecord, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

export const getNumber = (record: UnknownRecord, key: string): number | undefined => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export const stableClone = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableClone(record[key])]));
};
