export type ToastTone = 'success' | 'error' | 'info'

export type ToastEvent = {
    message: string
    tone: ToastTone
}

type ToastListener = (event: ToastEvent) => void

type ToastChannel = {
    listeners: Set<ToastListener>
}

const globalScope = globalThis as typeof globalThis & {
    __trackitToastChannel__?: ToastChannel
}

const channel = globalScope.__trackitToastChannel__ ?? { listeners: new Set<ToastListener>() }
globalScope.__trackitToastChannel__ = channel

const emit = (message: string, tone: ToastTone) => {
    channel.listeners.forEach(listener => listener({ message, tone }))
}

export const toast = {
    show: (message: string, tone: ToastTone = 'success') => emit(message, tone),
    success: (message: string) => emit(message, 'success'),
    error: (message: string) => emit(message, 'error'),
    info: (message: string) => emit(message, 'info'),
}

export const subscribeToToasts = (listener: ToastListener) => {
    channel.listeners.add(listener)
    return () => channel.listeners.delete(listener)
}
