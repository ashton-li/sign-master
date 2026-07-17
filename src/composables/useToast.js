import { computed, ref } from 'vue'

const visible = ref(false)
const message = ref('')
let timer = null

export function useToast() {
  function show(nextMessage, duration = 1800) {
    if (timer) clearTimeout(timer)
    message.value = nextMessage
    visible.value = true
    timer = setTimeout(() => {
      visible.value = false
    }, duration)
  }

  function hide() {
    if (timer) clearTimeout(timer)
    visible.value = false
  }

  return {
    visible: computed(() => visible.value),
    message: computed(() => message.value),
    show,
    hide
  }
}
