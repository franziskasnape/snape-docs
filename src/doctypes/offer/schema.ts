import type { MeasuresBlock } from '../../core/render/blocks/measures';
import type { ObjectsBlock } from '../../core/render/blocks/objects';
import type { OfferBlock } from './zod';

/**
 * The offer data types are DERIVED from the zod schema (zod.ts), the single definition of the shape: add a field there.
 * The checks below fail to compile if the schema stops satisfying what the block renderers expect.
 */
export type { OfferData, OfferBlock } from './zod';

type Satisfies<A extends B, B> = A;
export type _MeasuresMatch = Satisfies<Extract<OfferBlock, { type: 'measures' }>, MeasuresBlock>;
export type _ObjectsMatch = Satisfies<Extract<OfferBlock, { type: 'objects' }>, ObjectsBlock>;
