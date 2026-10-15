import type { RenderContext } from '../types';

/**
 * Marks rendered text with the editor field it comes from, for the preview's "double click to edit".
 * `path` is the editor's field path (data-path), e.g. "data.blocks.2.paragraphs.0"; a path with no field of its own
 * (such as "data.blocks.2") makes the editor scroll to that block instead. Printed output carries no markers.
 */
export function src(ctx: Pick<RenderContext, 'sourceMap'>, path: string, opts: { html?: boolean; line?: number } = {}): string {
  if (!ctx.sourceMap) return '';
  return ` data-src="${path}"${opts.html ? ' data-src-html="1"' : ''}${opts.line !== undefined ? ` data-src-line="${opts.line}"` : ''}`;
}
