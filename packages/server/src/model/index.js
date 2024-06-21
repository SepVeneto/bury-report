export class Filter {
  constructor(filter = {}) {
    this.filter = {
      ...filter,
      is_delete: {
        $ne: true
      }
    }
  }
  build() {
    return this.filter
  }
}

export * from './project.js'
