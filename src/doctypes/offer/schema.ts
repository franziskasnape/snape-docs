import type { ImageRef } from '../../core/types';
import type { MeasuresBlock } from '../../core/render/blocks/measures';
import type { ObjectsBlock } from '../../core/render/blocks/objects';

export type OfferBlock =
  | { id?: string; type: 'prose'; heading?: string; headingKey?: 'artist' | 'condition'; paragraphs: string[]; bullets?: string[] }
  | { id?: string; type: 'note'; label: 'hinweis' | 'fazit' | 'empfehlung'; html: string }
  | MeasuresBlock
  | ObjectsBlock
  | { id?: string; type: 'pagebreak' };

export interface OfferData {
  /** schema version, see migrations.ts (missing = 1) */
  v?: number;
  meta: { date: string; validUntil: string; dateAuto?: boolean; title?: string; eyebrow?: string };
  overview?: ImageRef & { note?: string; layout?: 'auto' | 'landscape' | 'portrait' };
  blocks: OfferBlock[];
  cost: { deliveryFrom?: string; pickupFrom?: string; materials: boolean; optionalDetail?: string; overrideHtml?: string;
    /** 'lines' = label/value lines (rate, effort, cost) above the text, instead of one sentence; missing = 'text' */
    style?: 'text' | 'lines' };
  rate: number;
  /** The owner's private notes about this offer (small HTML: bold, italic, lists). Never rendered into the document. */
  privateNotes?: string;
  /** contractor signature on the last page; missing = on */
  sign?: { enabled?: boolean; place?: string };
}
