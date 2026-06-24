import { ref } from 'vue'

export function useDialog() {
  const dialog = ref({
    show: false,
    message: '',
    isConfirm: false,
    onConfirm: null,
    onCancel: null,
  })

  function showDialog(message, onConfirm = null) {
    dialog.value = {
      show: true,
      message,
      isConfirm: false,
      onConfirm,
      onCancel: null,
    }
  }

  function showConfirm(message, onConfirm = null, onCancel = null) {
    dialog.value = {
      show: true,
      message,
      isConfirm: true,
      onConfirm,
      onCancel,
    }
  }

  function closeDialog() {
    dialog.value.show = false
  }

  function confirmDialog() {
    const callback = dialog.value.onConfirm
    closeDialog()
    callback?.()
  }

  function cancelDialog() {
    const callback = dialog.value.onCancel
    closeDialog()
    callback?.()
  }

  return {
    dialog,
    showDialog,
    showConfirm,
    closeDialog,
    confirmDialog,
    cancelDialog,
  }
}
