export function pagination(page?: string, limit?: string) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
  return { skip: (pageNumber - 1) * take, take };
}

export function paginationMeta(page?: string, limit?: string) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
  return { page: pageNumber, limit: take, skip: (pageNumber - 1) * take };
}

export function listResponse<T>(items: T[], total: number, page?: string, limit?: string) {
  const meta = paginationMeta(page, limit);
  return { items, total, page: meta.page, limit: meta.limit };
}
