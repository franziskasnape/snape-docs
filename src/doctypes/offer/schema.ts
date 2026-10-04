import type { ImageRef } from '../../core/types';
import type { MeasuresBlock } from '../../core/render/blocks/measures';

export type OfferBlock =
  | { type: 'prose'; heading?: string; paragraphs: string[] }
  | { type: 'note'; label: 'hinweis' | 'fazit' | 'empfehlung'; html: string }
  | MeasuresBlock
  | { type: 'pagebreak' };

export interface OfferData {
  meta: { date: string; validUntil: string; title?: string; eyebrow?: string };
  overview?: ImageRef & { note?: string };
  blocks: OfferBlock[];
  cost: { deliveryFrom?: string; pickupFrom?: string; materials: boolean; optionalDetail?: string; overrideHtml?: string };
  rate: number;
}
