/**
 * Server-only user directory: maps user_id uuids to a human label
 * (username, else first handle address, else a shortened uuid) so
 * operators can identify who each dashboard row belongs to.
 */
import "server-only";

import { adminGetSafe } from "@/lib/controlPlane";
import type { UsersResponse } from "@/lib/types";

export interface DirectoryUser {
  user_id: string;
  label: string;
  status: string;
  created_at: string;
  handles: { platform: string; address: string }[];
}

export interface UserDirectory {
  label: (userId: string) => string;
  users: DirectoryUser[];
}

const FALLBACK: UserDirectory = {
  label: (userId) => userId.slice(0, 8),
  users: [],
};

export async function fetchUserDirectory(): Promise<UserDirectory> {
  const users = await adminGetSafe<UsersResponse>("/api/admin/users");
  if (users.error !== null) return FALLBACK;
  const labels = new Map<string, string>();
  const list: DirectoryUser[] = [];
  for (const user of users.data.users) {
    const label =
      user.username ?? user.handles[0]?.address ?? user.user_id.slice(0, 8);
    labels.set(user.user_id, label);
    list.push({
      user_id: user.user_id,
      label,
      status: user.status,
      created_at: user.created_at,
      handles: user.handles,
    });
  }
  return {
    label: (userId) => labels.get(userId) ?? userId.slice(0, 8),
    users: list,
  };
}
