import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "./auth/guards";
import { ButtonLink } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { PageLoader } from "./components/Spinner";
import { AppShell } from "./layout/AppShell";

// Pages are code-split so guests opening an RSVP link only download what they need.
const LoginPage = lazy(() => import("./auth/LoginPage"));
const SignupPage = lazy(() => import("./auth/SignupPage"));
const WeddingsPage = lazy(() => import("./modules/weddings/WeddingsPage"));
const AccountPage = lazy(() => import("./modules/account/AccountPage"));
const WeddingLayout = lazy(() => import("./modules/weddings/WeddingLayout"));
const OverviewPage = lazy(() => import("./modules/weddings/OverviewPage"));
const SettingsPage = lazy(() => import("./modules/weddings/SettingsPage"));
const GuestsPage = lazy(() => import("./modules/guests/GuestsPage"));
const SeatingPage = lazy(() => import("./modules/seating/SeatingPage"));
const InvitationsPage = lazy(() => import("./modules/invitations/InvitationsPage"));
const RepliesPage = lazy(() => import("./modules/replies/RepliesPage"));
const LinkOpenPage = lazy(() => import("./modules/rsvp/LinkOpenPage"));
const RsvpPage = lazy(() => import("./modules/rsvp/RsvpPage"));

function ShellLayout() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function NotFound() {
  return (
    <div style={{ padding: "12vh 16px" }}>
      <EmptyState icon="heart" title="Page not found" actions={<ButtonLink to="/">Go to your weddings</ButtonLink>}>
        The page you're looking for doesn't exist or has moved.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <SignupPage />
            </GuestOnly>
          }
        />

        {/* Public pages for wedding guests: no sign-in, no app chrome. */}
        <Route path="/i/:token" element={<LinkOpenPage />} />
        <Route path="/rsvp/:token" element={<RsvpPage />} />

        <Route
          element={
            <RequireAuth>
              <Outlet />
            </RequireAuth>
          }
        >
          <Route element={<ShellLayout />}>
            <Route index element={<WeddingsPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
          <Route path="weddings/:weddingId" element={<WeddingLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="guests" element={<GuestsPage />} />
            <Route path="seating" element={<SeatingPage />} />
            <Route path="invitations" element={<InvitationsPage />} />
            <Route path="replies" element={<RepliesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
