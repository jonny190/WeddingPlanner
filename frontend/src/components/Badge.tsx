import type { ReactNode } from "react";
import type { DeliveryStatus, Engagement, Role, RsvpStatus } from "../api/types";
import { cx } from "../lib/utils";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent" | "info";

export function Badge({
  tone = "neutral",
  dot = false,
  children,
  title,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cx("badge", tone !== "neutral" && `badge-${tone}`, dot && "badge-dot")} title={title}>
      {children}
    </span>
  );
}

const RSVP: Record<RsvpStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting reply", tone: "neutral" },
  attending: { label: "Attending", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
};

export function RsvpBadge({ status, short = false }: { status: RsvpStatus; short?: boolean }) {
  const { label, tone } = RSVP[status];
  return (
    <Badge tone={tone} dot>
      {short && status === "pending" ? "Pending" : label}
    </Badge>
  );
}

export const ENGAGEMENT_LABELS: Record<Engagement, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  opened: "Opened, no reply",
  responded: "Replied",
};

const ENGAGEMENT_TONES: Record<Engagement, BadgeTone> = {
  not_sent: "neutral",
  sent: "info",
  opened: "warning",
  responded: "success",
};

export function EngagementBadge({ engagement }: { engagement: Engagement }) {
  return (
    <Badge tone={ENGAGEMENT_TONES[engagement]} dot>
      {ENGAGEMENT_LABELS[engagement]}
    </Badge>
  );
}

const DELIVERY: Record<DeliveryStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "warning" },
};

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const { label, tone } = DELIVERY[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={role === "owner" ? "accent" : role === "viewer" ? "neutral" : "info"}>{ROLE_LABELS[role]}</Badge>;
}
