import useSWR, { type SWRConfiguration } from 'swr'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'

/**
 * Cache-first wrapper around a Supabase query builder.
 *
 *   const { data, error, isLoading, mutate } = useSupabaseQuery(
 *     ['talents', talentId],
 *     () => supabase.from('talents').select('*').eq('id', talentId).maybeSingle()
 *   )
 *
 * The first arg is the SWR cache key (string or stable array). Pass `null` to
 * skip the request (conditional fetch). The fetcher must return a Supabase
 * PostgrestSingleResponse so we can surface its `.error` shape consistently.
 */
export function useSupabaseQuery<T>(
  key: string | readonly unknown[] | null,
  fetcher: () => PromiseLike<PostgrestSingleResponse<T>>,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(
    key,
    async () => {
      const { data, error } = await fetcher()
      if (error) throw error
      return data as T
    },
    config,
  )
}
