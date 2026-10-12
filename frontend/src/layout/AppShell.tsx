import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/session";
import { RoleBadge } from "../components/Badge";
import { IconButton } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { initials } from "../lib/format";
import { cx } from "../lib/utils";
import { BrandMark } from "./Brand";
import { useGuardedAction, useGuardedNavigate } from "./NavigationGuard";
import "./layout.css";

interface AppShellProps {
  /** Side navigation (wedding pages). Collapses into a drawer on small screens. */
  sidebar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className={cx("shell", sidebar ? "shell-with-sidebar" : undefined)}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        {sidebar && (
          <IconButton
            className="drawer-toggle"
            icon={drawerOpen ? "close" : "menu"}
            label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            aria-controls="sidebar"
            onClick={() => setDrawerOpen((v) => !v)}
          />
        )}
        <HomeLink />
        <div className="spacer" />
        <TenantSwitcher />
        <UserMenu />
      </header>
      <div className="shell-body">
        {sidebar && (
          <>
            <nav id="sidebar" className={cx("sidebar", drawerOpen && "open")} aria-label="Wedding">
              {sidebar}
            </nav>
            {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
          </>
        )}
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function HomeLink() {
  const guardedNavigate = useGuardedNavigate();
  return (
    <Link
      to="/"
      className="topbar-brand"
      aria-label="Wedding Planner home"
      onClick={(e) => {
        e.preventDefault();
        void guardedNavigate("/");
      }}
    >
      <BrandMark compact />
    </Link>
  );
}

function TenantSwitcher() {
  const { tenants, currentTenant, switchTenant } = useSession();
  const navigate = useNavigate();
  const guarded = useGuardedAction();
  if (!currentTenant) return null;
  return (
    <Dropdown
      label={`Account: ${currentTenant.name}. Switch account`}
      triggerClassName="btn btn-ghost tenant-trigger"
      trigger={
        <>
          <Icon name="briefcase" />
          <span className="tenant-name">{currentTenant.name}</span>
          <Icon name="chevronDown" />
        </>
      }
    >
      {() => (
        <>
          <div className="menu-label">{tenants.length > 1 ? "Switch account" : "Your account"}</div>
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              className={cx("menu-item", t.id === currentTenant.id && "active")}
              aria-current={t.id === currentTenant.id ? "true" : undefined}
              onClick={() => {
                if (t.id === currentTenant.id) return;
                void guarded(() => {
                  switchTenant(t.id);
                  navigate("/");
                });
              }}
            >
              <span className="tenant-dot" aria-hidden="true">
                {t.id === currentTenant.id && <Icon name="check" />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.name}</span>
              <RoleBadge role={t.role} />
            </button>
          ))}
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => void guarded(() => navigate("/account"))}
          >
            <Icon name="settings" /> Account settings
          </button>
        </>
      )}
    </Dropdown>
  );
}

function UserMenu() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const guarded = useGuardedAction();
  if (!user) return null;
  return (
    <Dropdown
      label={`Signed in as ${user.full_name}. Open user menu`}
      triggerClassName="avatar-trigger"
      trigger={<span className="avatar">{initials(user.full_name || user.email)}</span>}
    >
      {() => (
        <>
          <div className="menu-user">
            <strong>{user.full_name}</strong>
            <span className="small muted">{user.email}</span>
          </div>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => void guarded(() => navigate("/account"))}
          >
            <Icon name="settings" /> Account settings
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => void guarded(logout)}>
            <Icon name="logout" /> Sign out
          </button>
        </>
      )}
    </Dropdown>
  );
}
