import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

export interface LeaderboardEntry {
  username: string;
  net: number;
  roundsWon: number;
}

interface LeaderboardResponse {
  success: true;
  leaderboard: LeaderboardEntry[];
}

export function useLeaderboard(by: 'net' | 'rounds') {
  return useQuery<LeaderboardResponse>({
    queryKey: [`/api/leaderboard/${by}`],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
