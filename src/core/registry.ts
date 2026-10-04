import type { DocType } from './types';
import { offerType } from '../doctypes/offer/render';

/** Register new document types here. */
export const docTypes: Record<string, DocType<any>> = {
  [offerType.id]: offerType,
};

export const getDocType = (id: string) => docTypes[id];
