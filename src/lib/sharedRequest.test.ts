import { describe, expect, it, vi } from 'vitest'
import { sharedJsonRequest } from './sharedRequest'

describe('sharedJsonRequest', () => {
    it('deduplicates concurrent consumers and lets one consumer cancel independently', async () => {
        let complete!: (response: Response) => void
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockReturnValueOnce(new Promise(resolve => (complete = resolve)))
        const firstController = new AbortController()
        const first = sharedJsonRequest<{ data: number }>('/deduplicated', firstController.signal)
        const second = sharedJsonRequest<{ data: number }>('/deduplicated')

        firstController.abort()
        complete(new Response(JSON.stringify({ data: 42 }), { status: 200 }))

        await expect(first).rejects.toMatchObject({ name: 'AbortError' })
        await expect(second).resolves.toEqual({ data: 42 })
        expect(fetchMock).toHaveBeenCalledOnce()
        fetchMock.mockRestore()
    })
})
