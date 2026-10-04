/**
 * Offer data migrations. Index i upgrades schema version i+1 → i+2.
 *   v1 → v2: blocks, treatment rows and row photos get stable ids.
 * Ids for old data are derived from position (b1, b1-r2, b1-r2-p1) so that the same stored
 * document always upgrades to the same ids, wherever it is read.
 */
export const offerMigrations: ((d: any) => any)[] = [
  (d) => {
    (d.blocks ?? []).forEach((b: any, i: number) => {
      b.id ??= `b${i + 1}`;
      (b.rows ?? []).forEach((r: any, j: number) => {
        r.id ??= `${b.id}-r${j + 1}`;
        (r.images ?? []).forEach((im: any, k: number) => { im.id ??= `${r.id}-p${k + 1}`; });
      });
    });
    return d;
  },
];
