import { useQuery } from "@tanstack/react-query";
import type {
  AppInfo,
  AppNotification,
  Category,
  PublicUser,
  TicketDetail,
  TicketListQuery,
  TicketSummary,
} from "@fixit/shared";
import { api, RequestError } from "./api";

export const keys = {
  info: ["info"] as const,
  me: ["me"] as const,
  categories: ["categories"] as const,
  tickets: (q?: TicketListQuery) => (q ? (["tickets", q] as const) : (["tickets"] as const)),
  ticket: (id: number) => ["ticket", id] as const,
  notifications: ["notifications"] as const,
  users: ["users"] as const,
  passkeys: ["passkeys"] as const,
};

export const useInfo = () => useQuery({ queryKey: keys.info, queryFn: () => api.get<AppInfo>("/api/info") });

export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: PublicUser }>("/api/auth/me")).user;
      } catch (err) {
        if (err instanceof RequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api.get<Category[]>("/api/categories"), staleTime: 5 * 60_000 });

export const useTickets = (query: TicketListQuery) =>
  useQuery({
    queryKey: keys.tickets(query),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      return api.get<TicketSummary[]>(`/api/tickets?${params}`);
    },
    refetchInterval: 60_000,
  });

export const useTicket = (id: number) =>
  useQuery({ queryKey: keys.ticket(id), queryFn: () => api.get<TicketDetail>(`/api/tickets/${id}`), refetchInterval: 60_000 });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.get<{ unread: number; items: AppNotification[] }>("/api/notifications"),
    refetchInterval: 60_000,
  });

export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => api.get<PublicUser[]>("/api/users") });
