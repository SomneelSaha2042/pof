import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { gameSocket } from '@/lib/socket';

interface MeResponse {
  success: true;
  username: string;
}

interface StatsResponse {
  success: true;
  chipsWon: number;
  chipsLost: number;
  net: number;
}

interface RoundHistoryEntry {
  roomCode: string;
  roundNumber: number;
  payout: number;
  createdAt: string;
}

interface HistoryResponse {
  success: true;
  rounds: RoundHistoryEntry[];
}

interface AuthErrorBody {
  success: false;
  error: string;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as AuthErrorBody;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery<MeResponse | null>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    // Identity, not just display data: a stale "logged in" cache here means
    // the WebSocket can go on stamping actions under an account whose
    // session no longer exists server-side (e.g. after it was revoked or
    // expired), silently misattributing or dropping game history.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const signup = useMutation({
    mutationFn: async (input: { username: string; email: string; password: string }) => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await extractError(res, 'Could not create account'));
      return (await res.json()) as MeResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
      queryClient.invalidateQueries({ queryKey: ['/api/me/stats'] });
      gameSocket.reconnectForFreshSession();
    },
  });

  const login = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await extractError(res, 'Invalid email or password'));
      return (await res.json()) as MeResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
      queryClient.invalidateQueries({ queryKey: ['/api/me/stats'] });
      gameSocket.reconnectForFreshSession();
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.removeQueries({ queryKey: ['/api/me/stats'] });
      gameSocket.reconnectForFreshSession();
    },
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    signup,
    login,
    logout,
  };
}

export function useStats(enabled: boolean) {
  return useQuery<StatsResponse | null>({
    queryKey: ['/api/me/stats'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled,
    // Stats change every time a round settles elsewhere in the app (over the
    // WebSocket, not through react-query), so the default staleTime:Infinity
    // would keep showing whatever was cached the first time this page loaded.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useRoundHistory(enabled: boolean) {
  return useQuery<HistoryResponse | null>({
    queryKey: ['/api/me/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
