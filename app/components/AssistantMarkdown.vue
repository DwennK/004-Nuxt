<script setup lang="ts">
import { renderAssistantMarkdown } from '~/utils/assistantMarkdown'

const props = defineProps<{ content: string }>()
const html = computed(() => renderAssistantMarkdown(props.content))
</script>

<template>
  <!-- HTML comes only from the Markdown renderer with raw HTML disabled. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="assistant-markdown min-w-0 text-sm leading-6 text-default" v-html="html" />
</template>

<style scoped>
@reference "../assets/css/main.css";

.assistant-markdown {
  overflow-wrap: anywhere;
}

.assistant-markdown :deep(> * + *) {
  margin-top: 0.75rem;
}

.assistant-markdown :deep(h1),
.assistant-markdown :deep(h2),
.assistant-markdown :deep(h3),
.assistant-markdown :deep(h4),
.assistant-markdown :deep(h5),
.assistant-markdown :deep(h6) {
  @apply text-base font-semibold text-highlighted;
}

.assistant-markdown :deep(strong) {
  @apply font-semibold text-highlighted;
}

.assistant-markdown :deep(ul) {
  @apply list-disc ps-5;
}

.assistant-markdown :deep(ol) {
  @apply list-decimal ps-5;
}

.assistant-markdown :deep(li + li),
.assistant-markdown :deep(li > p + p) {
  margin-top: 0.25rem;
}

.assistant-markdown :deep(a) {
  @apply text-primary underline underline-offset-2;
}

.assistant-markdown :deep(blockquote) {
  @apply border-s-2 border-accented ps-3 text-toned;
}

.assistant-markdown :deep(code) {
  @apply rounded bg-elevated px-1 py-0.5 font-mono text-xs;
}

.assistant-markdown :deep(pre) {
  @apply max-w-full overflow-x-auto rounded-lg border border-default bg-elevated p-3;
  overflow-wrap: normal;
}

.assistant-markdown :deep(pre code) {
  @apply bg-transparent p-0;
}

.assistant-markdown :deep(hr) {
  @apply border-default;
}

.assistant-markdown :deep(.assistant-table) {
  @apply max-w-full overflow-x-auto rounded-lg border border-default;
}

.assistant-markdown :deep(table) {
  @apply w-full border-collapse text-left text-sm;
}

.assistant-markdown :deep(th),
.assistant-markdown :deep(td) {
  @apply border-b border-default px-3 py-2 align-top;
  min-width: 7rem;
}

.assistant-markdown :deep(th) {
  @apply bg-elevated font-semibold text-highlighted;
}

.assistant-markdown :deep(tbody tr:last-child td) {
  @apply border-b-0;
}
</style>
