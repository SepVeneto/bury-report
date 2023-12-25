function normalize(object) {
  Object.entries(object).reduce((all, curr) => {
    const [key, value] = curr
    if (value == null || value === '') {
      return all
    }
    all[key] = value
    return all
  }, {})
}

module.exports = {
  normalize,
}