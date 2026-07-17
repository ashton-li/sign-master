<template>
  <view :class="['app-page', themeClass]">
    <view :class="contentClass">
      <slot />
    </view>
    <!-- #ifndef MP-WEIXIN -->
    <BottomNav v-if="tab" :active="active" />
    <!-- #endif -->
    <slot name="overlay" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import BottomNav from './BottomNav.vue'
import { useTheme } from '../composables/useTheme'

const props = defineProps({
  active: {
    type: String,
    default: 'home'
  },
  tab: {
    type: Boolean,
    default: true
  },
  scroll: {
    type: Boolean,
    default: true
  },
  compact: {
    type: Boolean,
    default: false
  }
})

const { themeClass } = useTheme()

const contentClass = computed(() => [props.compact ? 'sign-page-scroll' : 'page-scroll', props.tab ? 'tab-page-scroll' : 'native-page-scroll'])
</script>
