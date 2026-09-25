<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<number | null>({ default: null })

function insertDecimalText(input: HTMLInputElement, text: string, inputType: string) {
  if (input.disabled || input.readOnly) return

  const data = text.replaceAll('.', ',')
  // Let the underlying number field validate the normalized insertion first.
  const accepted = input.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType,
    data
  }))
  if (!accepted) return

  input.setRangeText(data, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end')
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }))
}

function onBeforeInput(event: InputEvent) {
  if (event.isComposing || !event.data?.includes('.') || !event.cancelable) return

  event.preventDefault()
  event.stopImmediatePropagation()
  insertDecimalText(event.target as HTMLInputElement, event.data, event.inputType)
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain')
  if (!text?.includes('.')) return

  event.preventDefault()
  insertDecimalText(event.target as HTMLInputElement, text, 'insertFromPaste')
}

function onInput(event: InputEvent) {
  if (event.isComposing) return

  // Autofill and some mobile keyboards insert text without a cancellable beforeinput.
  const input = event.target as HTMLInputElement
  if (!input.value.includes('.')) return

  const start = input.selectionStart
  const end = input.selectionEnd
  input.value = input.value.replaceAll('.', ',')
  input.setSelectionRange(start, end)
}
</script>

<template>
  <UInputNumber
    v-model="model"
    v-bind="$attrs"
    locale="fr-FR"
    @beforeinput.capture="onBeforeInput"
    @paste.capture="onPaste"
    @input.capture="onInput"
  />
</template>
