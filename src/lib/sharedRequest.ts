type PendingRequest = {
    controller: AbortController
    consumers: number
    promise: Promise<unknown>
    abortTimer?: number
}

const pending = new Map<string, PendingRequest>()

export function sharedJsonRequest<T>(url: string, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    let request = pending.get(url)
    if (!request) {
        const controller = new AbortController()
        const created: PendingRequest = {
            controller,
            consumers: 0,
            promise: fetch(url, { credentials: 'same-origin', signal: controller.signal }).then(
                async response => {
                    if (!response.ok) throw new Error(`Request failed (${response.status})`)
                    return response.json()
                },
            ),
        }
        request = created
        pending.set(url, created)
        void created.promise.finally(() => pending.delete(url)).catch(() => undefined)
    }
    if (request.abortTimer) window.clearTimeout(request.abortTimer)
    request.consumers += 1

    return new Promise<T>((resolve, reject) => {
        let settled = false
        const release = () => {
            request!.consumers -= 1
            if (request!.consumers === 0 && pending.get(url) === request) {
                request!.abortTimer = window.setTimeout(() => request!.controller.abort(), 0)
            }
        }
        const abort = () => {
            if (settled) return
            settled = true
            release()
            reject(new DOMException('Aborted', 'AbortError'))
        }
        signal?.addEventListener('abort', abort, { once: true })
        request!.promise.then(
            value => {
                if (settled) return
                settled = true
                signal?.removeEventListener('abort', abort)
                release()
                resolve(value as T)
            },
            error => {
                if (settled) return
                settled = true
                signal?.removeEventListener('abort', abort)
                release()
                reject(error)
            },
        )
    })
}
