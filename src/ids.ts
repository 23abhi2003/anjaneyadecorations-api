const ORDER_PREFIX = "ADVKM";

/** Builds the next ADVKM-#### id from the highest `seq` currently stored. */
export function nextOrderId(maxSeq: number | null): { id: string; seq: number } {
  const next = (maxSeq ?? 0) + 1;
  return { id: `${ORDER_PREFIX}-${String(next).padStart(4, "0")}`, seq: next };
}

export function seqFromOrderId(id: string): number | null {
  const m = new RegExp(`^${ORDER_PREFIX}-(\\d+)$`).exec(id);
  return m ? parseInt(m[1], 10) : null;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "record"
  );
}

export function uniqueSlug(base: string, existingIds: string[]): string {
  let id = slugify(base);
  let n = 1;
  while (existingIds.includes(id)) {
    id = `${slugify(base)}-${n++}`;
  }
  return id;
}
