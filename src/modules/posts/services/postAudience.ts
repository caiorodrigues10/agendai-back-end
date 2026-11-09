import { postCategoryForSegment } from './postCategoryCollections';
/** Context comes from the authenticated establishment, never from generated copy. */
export interface PostBusinessContext {
  businessSegment?: string | null;
  targetAudience?: string | null;
}
export function postAudience(context: PostBusinessContext) {
  const collection = postCategoryForSegment(context.businessSegment);
  return { category: collection.category, label: collection.label, stock: collection.stock,
    audience: context.targetAudience ?? 'não informado', segment: context.businessSegment ?? 'não informado' };
}
