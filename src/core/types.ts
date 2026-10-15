export type Lang = 'de' | 'en';

export interface ImageRef { id?: string; imageId: number; caption?: string }

export interface Party {
  name?: string; address?: string; contact?: string; phone?: string; email?: string;
}

/** Everything a renderer needs besides the doc type's own `data`. */
export interface RenderContext {
  number: string;
  lang: Lang;
  client: Party;
  /** Objekt lines, e.g. [{k:'Künstler/in', v:'…'}] */
  artwork: { k: string; v: string }[];
  /** Resolve an image id to a URL or data: URI */
  imageSrc(id: number): string;
  /** Pixel sizes of the images a document uses (for choosing layouts) */
  imageDims?: Record<number, { w: number; h: number }>;
  /** The studio owner's signature for the contractor line: image URL (empty if none uploaded) and the default place of signing */
  signature?: { src: string; place: string; baseline: number };
  /** Editor preview only: mark text with the editor field it comes from (data-src), so a double click can jump to it */
  sourceMap?: boolean;
}

/** One piece of wording a proofreader may check (see doctypes/offer/text.ts) */
export interface TextField { path: string; text: string; label: string; html: boolean }

export interface Settings { hourlyRate: number; validityDays: number; defaultLang: Lang; signatureImageId: number | null; signaturePlace: string; signatureBaseline: number; proofreadRules: string; proofreadModel: string; proofreadProvider: 'auto' | 'api' | 'local-claude'; proofreadLocalModel: string; proofreadEffort: 'low' | 'medium' | 'high' }

export interface DocType<D = unknown> {
  id: string;
  prefix: string;
  labels: Record<Lang, string>;
  statuses: string[];
  /** Current shape of `data`; older data is upgraded by `migrations` when loaded (see core/migrate.ts) */
  schemaVersion: number;
  migrations: ((d: any) => any)[];
  /** One line per migration (index i = what version i+2 changed); shown by GET /api/doctypes and kept in step by a test */
  schemaChangelog: string[];
  /** Initial `data` for a new document; `today` is ISO yyyy-mm-dd */
  defaultData(lang: Lang, settings: Settings, today: string): D;
  /** Default Objekt lines for a new document */
  defaultArtwork(lang: Lang): { k: string; v: string }[];
  /** Returns an error message if `data` must not be saved (e.g. a missing date), otherwise null */
  validate?(data: D): string | null;
  /** Schema of `data`: every write is checked against it and it is published as JSON Schema for scripts and agents. */
  schema?: import('zod').ZodType;
  /** Applied whenever a document is read: lets a type keep date-like fields current while the document is still a draft. */
  refresh?(data: D, status: string, today: string): D;
  render(data: D, ctx: RenderContext, opts?: { cssHref?: string; inlineCss?: string; sealSrc?: string }): string;
  /** Generated default text of the computed cost paragraph, if the type has one (editor 'edit manually') */
  costText?(data: D, lang: Lang): string;
  /** The wording of a document that can be proofread (never private notes, numbers or client data) */
  textFields?(data: D): TextField[];
}
