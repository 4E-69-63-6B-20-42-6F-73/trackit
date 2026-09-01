import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listJournal, type JournalQuery } from '../lib/journalApi'
import { serverQueryKeys } from '../lib/serverQueries'

export type ServerStatus = 'connecting' | 'online' | 'offline'

export function useJournal(query: JournalQuery & { limit: number }, enabled = true) {
    const { from, to, category, source, limit } = query
    const journalQuery = useInfiniteQuery({
        queryKey: [...serverQueryKeys.journal, { from, to, category, source, limit }],
        enabled,
        initialPageParam: null as string | null,
        queryFn: ({ pageParam, signal }) =>
            listJournal(
                {
                    from,
                    to,
                    category,
                    source,
                    before: pageParam ?? undefined,
                    limit,
                },
                signal,
            ),
        getNextPageParam: records =>
            records.length === limit ? (records.at(-1)?.observedAt ?? null) : null,
    })
    const events = useMemo(() => {
        const known = new Set<string>()
        return (journalQuery.data?.pages.flat() ?? []).flatMap(event => {
            if (known.has(event.id)) return []
            known.add(event.id)
            return [
                event.entityType === 'meal' && event.definitionId !== 'meal'
                    ? { ...event, definitionId: 'meal' }
                    : event,
            ]
        })
    }, [journalQuery.data])
    const status: ServerStatus = !enabled
        ? 'online'
        : journalQuery.isPending
          ? 'connecting'
          : journalQuery.isError && !journalQuery.data
            ? 'offline'
            : 'online'
    const syncFailure = journalQuery.isFetchNextPageError
        ? 'Older journal entries could not be loaded.'
        : journalQuery.isError
          ? 'The journal could not be loaded from your server. No local copy is being shown.'
          : ''

    return {
        events: enabled ? events : [],
        status,
        syncFailure,
        retry: () => {
            if (journalQuery.isFetchNextPageError) void journalQuery.fetchNextPage()
            else void journalQuery.refetch()
        },
        hasOlder: enabled && Boolean(journalQuery.hasNextPage),
        loadingOlder: journalQuery.isFetchingNextPage,
        loadOlder: () => {
            if (journalQuery.hasNextPage && !journalQuery.isFetchingNextPage)
                void journalQuery.fetchNextPage()
        },
    }
}
