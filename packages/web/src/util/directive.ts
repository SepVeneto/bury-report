// autofocus.ts
import { type Directive } from 'vue'

export const autofocus: Directive<HTMLElement> = {
  mounted(el) {
    setTimeout(() => {
      const input = el.querySelector('input')
      if (!input) return
      input.focus()
    }, 500)
  },
}
