import type { ImageRef } from '../../core/types';
import type { MeasuresBlock } from '../../core/render/blocks/measures';

export type OfferBlock =
  | { id?: string; type: 'prose'; heading?: string; headingKey?: 'artist' | 'condition'; paragraphs: string[] }
  | { id?: string; type: 'note'; label: 'hinweis' | 'fazit' | 'empfehlung'; html: string }
  | MeasuresBlock
  | { id?: string; type: 'pagebreak' };

export interface OfferData {
  /** schema version, see migrations.ts (missing = 1) */
  v?: number;
  meta: { date: string; validUntil: string; title?: string; eyebrow?: string };
  overview?: ImageRef & { note?: string; layout?: 'auto' | 'landscape' | 'portrait' };
  blocks: OfferBlock[];
  cost: { deliveryFrom?: string; pickupFrom?: string; materials: boolean; optionalDetail?: string; overrideHtml?: string };
  rate: number;
}
