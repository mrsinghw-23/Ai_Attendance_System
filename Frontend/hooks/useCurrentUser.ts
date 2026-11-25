"use client";

import { useEffect, useState } from "react";

export interface CurrentUser {
  id: number;
  username: string;
  role: string;
  full_name?: string | null;
  email?: string | null;
  mobile?: string | null;
  department?: string | null;
  profile_image?: string | null;
  employee_id?: number | null;
  employee_name?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  last_login_at?: string | null;
  password_reset_required?: boolean;
  permissions?: string[];
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();

        if (data.success) {
          setUser(data.user);

          if (
            data.user.password_reset_required &&
            !window.location.pathname.startsWith("/change-password") &&
            window.location.pathname !== "/login"
          ) {
            window.location.href = "/change-password";
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  return {
    user,
    loading,
  };
}
