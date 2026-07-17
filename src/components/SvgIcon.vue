<template>
  <image class="svg-icon" :style="iconStyle" :src="source" mode="aspectFit" aria-hidden="true" />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ name: { type: String, default: 'file' }, size: { type: [Number, String], default: 24 }, color: { type: String, default: '#5856e0' } })
const paths = {
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  template: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M8 9h13M8 15h13"/>',
  sign: '<path d="M4 18c4-1 6-7 9-10 2-2 4 0 3 2-2 4-6 7-4 8 2 1 4-3 6-3 1 0 1 2 3 1"/><path d="M3 21h18"/>',
  signatureLibrary: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h7M7 12h5M7 17c2-1 3-4 5-4 1 0 0 2 1 2s2-2 4-1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 5 5"/>',
  chat: '<path d="M4 4h16v12H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>',
  scan: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M6 12h12"/>',
  folder: '<path d="M3 6h7l2 3h9v11H3z"/>',
  moon: '<path d="M20 15a8 8 0 1 1-11-11 7 7 0 0 0 11 11z"/>',
  pin: '<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13z"/><circle cx="12" cy="9" r="2"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2"/>',
  upload: '<path d="M12 16V3M7 8l5-5 5 5M4 14v7h16v-7"/>',
  eraser: '<path d="M4 15l9-10 7 7-8 9H7z"/><path d="M10 8l7 7M11 21h10"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-4-5-9-5z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="10" cy="6.5" r=".8" fill="currentColor"/><circle cx="15" cy="7" r=".8" fill="currentColor"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  drag: '<path d="M8 6h8M8 12h8M8 18h8"/><circle cx="5" cy="6" r=".8" fill="currentColor"/><circle cx="5" cy="12" r=".8" fill="currentColor"/><circle cx="5" cy="18" r=".8" fill="currentColor"/>',
  undo: '<path d="M9 7l-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/>'
  ,rotate: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/><path d="M17 3v4h-4"/>'
  ,reset: '<path d="M4 4v6h6"/><path d="M5 9a8 8 0 1 1-1 6"/>'
  ,pdf: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>'
  ,photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 5 5"/>'
  ,cameraFile: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/><path d="M17 4v4h4"/>'
  ,arrowLeft: '<path d="M15 5l-7 7 7 7"/><path d="M8 12h12"/>'
  ,arrowDown: '<path d="M5 9l7 7 7-7"/><path d="M12 4v12"/>'
  ,zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/>'
  ,zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6"/>'
  ,share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.7 10.7l6.6-4.1M8.7 13.3l6.6 4.1"/>'
  ,shield: '<path d="M12 2l8 3v6c0 5-3.2 8.4-8 11-4.8-2.6-8-6-8-11V5z"/><path d="M8 12l2.5 2.5L16 9"/>'
  ,fingerprint: '<path d="M7 9a5 5 0 0 1 10 0c0 6-2 10-5 13M5 13c0-2 0-4 1-6M9 18c1-3 1-6 1-9a2 2 0 0 1 4 0c0 5-1 8-3 11M18 14c1-3 1-7 0-9"/>'
  ,archive: '<path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/><path d="M12 14v4M9 17l3 3 3-3"/>'
  ,capacity: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'
}
const source = computed(() => {
  const body = paths[props.name] || paths.file
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${props.color}" color="${props.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
})
const iconStyle = computed(() => { const value = typeof props.size === 'number' ? `${props.size}px` : props.size; return { width: value, height: value } })
</script>

<style scoped>.svg-icon { display: block; flex-shrink: 0; }</style>
