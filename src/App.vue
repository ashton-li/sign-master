<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { useThemeStore } from './stores/theme'
import { initializeIdentity } from './core/security/identity'

const themeStore = useThemeStore()

function handleThemeInit() {
  themeStore.init()
}

onLaunch(() => {
  handleThemeInit()
  setTimeout(() => initializeIdentity().catch(() => {}), 80)
})
onShow(handleThemeInit)
</script>

<style lang="scss">
@import './uni.scss';
</style>
