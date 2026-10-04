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
}

export interface DocType<D = unknown> {
  id: string;
  prefix: string;
  labels: Record<Lang, string>;
  render(data: D, ctx: RenderContext): string;
}
