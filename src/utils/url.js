export function withQuery(path, params = {}) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }

  const search = query.toString()
  return search ? `${path}?${search}` : path
}
