/**
 * Resolve Product.type filter for list queries.
 * purpose wins over forSale and exact type.
 */
export function productTypeWhere(query: {
  purpose?: "sale" | "own";
  forSale?: string;
  type?: string;
}): { type: string } | { type: { in: ("RETAIL" | "CONSUMABLE" | "BOTH")[] } } | undefined {
  if (query.purpose === "own") {
    return { type: { in: ["CONSUMABLE", "BOTH"] } };
  }
  if (query.purpose === "sale" || query.forSale === "true") {
    return { type: { in: ["RETAIL", "BOTH"] } };
  }
  if (query.type) {
    return { type: query.type };
  }
  return undefined;
}
