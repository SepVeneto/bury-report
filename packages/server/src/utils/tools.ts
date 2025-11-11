export function normalize(object) {
  return Object.entries(object).reduce((all, curr) => {
    const [key, value] = curr
    if (value == null || value === '') {
      return all
    }
    all[key] = value
    return all
  }, {})
}
