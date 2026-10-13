import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { Spinner, ErrorNote } from "./components/ui";
import { keys, useInfo, useMe } from "./lib/queries";
import { SetupPage } from "./pages/SetupPage";
import { LoginPage } from "./pages/LoginPage";
import { TicketListPage } from "./pages/TicketListPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { TicketPage } from "./pages/TicketPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { CategoriesPage } from "./pages/CategoriesPage";

export function App() {
  const info = useInfo();
  const me = useMe();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onSignedOut = () => queryClient.setQueryData(keys.me, null);
    window.addEventListener("fixit:signed-out", onSignedOut);
    return () => window.removeEventListener("fixit:signed-out", onSignedOut);
  }, [queryClient]);

  if (info.isPending || me.isPending) return <Spinner />;
  if (info.error || me.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorNote error={info.error ?? me.error} />
      </div>
    );
  }

  if (info.data.needsSetup) return <SetupPage />;
  if (!me.data) return <LoginPage />;

  const user = me.data;
  const admin = user.role === "admin";
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} />}>
          <Route index element={<TicketListPage user={user} />} />
          <Route path="new" element={<NewTicketPage />} />
          <Route path="tickets/:id" element={<TicketPage user={user} />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage user={user} />} />
          {admin && <Route path="settings/people" element={<PeoplePage user={user} />} />}
          {admin && <Route path="settings/categories" element={<CategoriesPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
