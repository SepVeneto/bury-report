<script lang="tsx">
import { defineComponent } from 'vue'
import { useApp } from '@/store'
export default defineComponent({
  name: 'RxAuth',
  props: {
    code: {
      type: String,
      default: '',
    }
  },
  setup() {
    const store = useApp()
    function hasAuth(code?: string) {
      if (!code) {
        return true;
      }
      return store.hasAuth(code)
    }
    return {
      hasAuth
    }
  },
  render() {
    if (this.hasAuth(this.code)) {
      // return this.$slots
      return this.$slots.default?.()
    } else {
      return null;
    }
  }
})
</script>