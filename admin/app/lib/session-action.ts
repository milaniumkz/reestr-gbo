export async function withRefreshedSession<T>(
  token: string,
  refreshSession: () => Promise<string | null>,
  action: (token: string) => Promise<T>,
): Promise<{ value: T; token: string }> {
  try {
    return { value: await action(token), token };
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('status' in error) || error.status !== 401) throw error;
    const nextToken = await refreshSession();
    if (!nextToken) throw new Error('Сессия завершена. Войдите заново.');
    return { value: await action(nextToken), token: nextToken };
  }
}
