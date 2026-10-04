import type { Lang } from './types';

/** Labels shared by all document types. Type-specific labels live in doctypes/<type>/i18n.ts */
export const common = {
  de: {
    tagline: 'Konservierung &amp; Restaurierung<br>von Gemälden und Skulpturen',
    phone: 'Telefon', email: 'E-Mail', date: 'Datum',
    page: 'Seite',
    object: 'Objekt', client: 'Auftraggeber',
    clientName: 'Name', clientAddress: 'Adresse', clientContact: 'Kontakt',
    signPlace: 'Ort, Datum',
    signMaker: 'Unterschrift Auftragnehmerin — <span style="white-space:nowrap">Snape Art Conservation</span>',
    signClient: 'Unterschrift Auftraggeber',
  },
  en: {
    tagline: 'Conservation &amp; Restoration<br>of Paintings and Sculptures',
    phone: 'Phone', email: 'Email', date: 'Date',
    page: 'Page',
    object: 'Object', client: 'Client',
    clientName: 'Name', clientAddress: 'Address', clientContact: 'Contact',
    signPlace: 'Place, date',
    signMaker: 'Signature contractor — <span style="white-space:nowrap">Snape Art Conservation</span>',
    signClient: 'Signature client',
  },
} satisfies Record<Lang, Record<string, string>>;

/** Studio details: identical on every document */
export const studio = {
  phone: '+41 78 652 1080',
  email: 'info@snape-conservation.com',
  address: 'Erlenstrasse 89, 8805 Richterswil',
};
