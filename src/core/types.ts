export type Lang = 'de' | 'en';

export interface ImageRef { imageId: number; caption?: string }

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
}

export interface Settings { hourlyRate: number; validityDays: number; defaultLang: Lang }

export interface DocType<D = unknown> {
  id: string;
  prefix: string;
  labels: Record<Lang, string>;
  statuses: string[];
  /** Initial `data` for a new document; `today` is ISO yyyy-mm-dd */
  defaultData(lang: Lang, settings: Settings, today: string): D;
  /** Default Objekt lines for a new document */
  defaultArtwork(lang: Lang): { k: string; v: string }[];
  render(data: D, ctx: RenderContext, opts?: { embedded?: boolean; inlineCss?: string; sealSrc?: string; inlinePaged?: string }): string;
  /** Generated default text of the computed cost paragraph, if the type has one (editor 'edit manually') */
  costText?(data: D, lang: Lang): string;
}
