export const BORDER_ROWS_PER_PAGE = 14;
export const FINAL_BORDER_ROWS = 12;

/**
 * Distributes rows across the minimum number of pages while keeping the last
 * page short enough for totals and signatures.
 * @template T
 * @param {T[]} items
 * @returns {T[][]}
 */
export function paginateBorderoRows(items) {
  if (items.length <= FINAL_BORDER_ROWS) return [items];
  const pageCount = Math.ceil((items.length - FINAL_BORDER_ROWS) / BORDER_ROWS_PER_PAGE) + 1;
  const sizes = Array(pageCount).fill(Math.floor(items.length / pageCount));
  for (let index = 0; index < items.length % pageCount; index += 1) sizes[index] += 1;

  let excess = Math.max(0, sizes.at(-1) - FINAL_BORDER_ROWS);
  sizes[sizes.length - 1] -= excess;
  for (let index = 0; index < sizes.length - 1 && excess > 0; index += 1) {
    const moved = Math.min(BORDER_ROWS_PER_PAGE - sizes[index], excess);
    sizes[index] += moved;
    excess -= moved;
  }

  let offset = 0;
  return sizes.map(size => {
    const page = items.slice(offset, offset + size);
    offset += size;
    return page;
  });
}
