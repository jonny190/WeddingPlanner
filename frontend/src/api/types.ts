// API types, mirroring backend/app/modules/*/schemas.py.
// Design and media types come from the invitation designer, which owns that format.
import type {
  FontOption,
  InvitationDesign,
  MediaAsset,
  Placeholder,
} from "../modules/invitations/designer";

export type { FontOption, InvitationDesign, MediaAsset, Placeholder };

/** ISO date "YYYY-MM-DD". */
export type ISODate = string;
/** ISO date-time. Event times are naive wall-clock ("2027-06-12T14:00:00"); audit times are UTC. */
export type ISODateTime = string;

// --- Tenancy ---------------------------------------------------------------------------

export type Role = "owner" | "admin" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
  account_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionResponse {
  access_token: string;
  token_type: string;
  user: User;
  tenants: Tenant[];
}

export interface MeResponse {
  user: User;
  tenants: Tenant[];
}

export interface Member {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
}

export interface MemberCreate {
  email: string;
  role: Role;
  full_name?: string | null;
  password?: string | null;
}

// --- Weddings & events ---------------------------------------------------------------------

export type EventKind = "day" | "evening" | "other";

export interface WeddingEvent {
  id: string;
  wedding_id: string;
  kind: EventKind;
  name: string;
  starts_at: ISODateTime | null;
  ends_at: ISODateTime | null;
  venue_name: string | null;
  venue_address: string | null;
  details: string | null;
  rsvp_deadline: ISODate | null;
  sort_order: number;
}

export interface EventInput {
  name: string;
  kind: EventKind;
  starts_at: ISODateTime | null;
  ends_at: ISODateTime | null;
  venue_name: string | null;
  venue_address: string | null;
  details: string | null;
  rsvp_deadline: ISODate | null;
}

export interface Wedding {
  id: string;
  title: string;
  partner_one_name: string;
  partner_two_name: string;
  couple_names: string;
  wedding_date: ISODate | null;
  contact_email: string | null;
  notes: string | null;
  created_at: ISODateTime;
  events: WeddingEvent[];
}

export interface WeddingCreate {
  partner_one_name: string;
  partner_two_name: string;
  title?: string | null;
  wedding_date?: ISODate | null;
  contact_email?: string | null;
  notes?: string | null;
  create_default_events?: boolean;
}

export interface WeddingUpdate {
  partner_one_name?: string;
  partner_two_name?: string;
  title?: string;
  wedding_date?: ISODate | null;
  contact_email?: string | null;
  notes?: string | null;
}

// --- Guests ---------------------------------------------------------------------------------

export type AgeGroup = "adult" | "child" | "infant";
export type RsvpStatus = "pending" | "attending" | "declined";
export type ResponseChannel = "online" | "manual";

export interface InvitationSpec {
  event_id: string;
  plus_one_allowed: boolean;
}

export interface EventInvitation {
  id: string;
  event_id: string;
  guest_id: string;
  plus_one_allowed: boolean;
  rsvp_status: RsvpStatus;
  plus_one_attending: boolean | null;
  plus_one_name: string | null;
  plus_one_dietary: string | null;
  guest_message: string | null;
  responded_at: ISODateTime | null;
  response_channel: ResponseChannel | null;
  first_sent_at: ISODateTime | null;
  last_sent_at: ISODateTime | null;
  first_clicked_at: ISODateTime | null;
  last_clicked_at: ISODateTime | null;
  click_count: number;
}

export interface Guest {
  id: string;
  wedding_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  group_name: string | null;
  age_group: AgeGroup;
  dietary_requirements: string | null;
  notes: string | null;
  rsvp_token: string;
  created_at: ISODateTime;
  invitations: EventInvitation[];
}

export interface GuestInput {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  group_name: string | null;
  age_group: AgeGroup;
  dietary_requirements: string | null;
  notes: string | null;
  invitations: InvitationSpec[];
}

export interface BulkResult {
  affected: number;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}

// --- Seating --------------------------------------------------------------------------------

export type TableShape = "round" | "rectangle";
export type ConstraintKind = "apart" | "together";

export interface SeatingTable {
  id: string;
  event_id: string;
  name: string;
  capacity: number;
  shape: TableShape;
  sort_order: number;
}

export interface TableCreate {
  name?: string | null;
  capacity: number;
  shape: TableShape;
}

export interface TableUpdate {
  name?: string;
  capacity?: number;
  shape?: TableShape;
  sort_order?: number;
}

export interface TablesBulkCreate {
  count: number;
  capacity: number;
  shape: TableShape;
  name_prefix?: string;
  start_number?: number;
  replace_existing?: boolean;
}

export interface SeatedGuest {
  guest_id: string;
  invitation_id: string;
  full_name: string;
  group_name: string | null;
  /** 2 when a plus-one is coming. */
  seats: number;
  plus_one_name: string | null;
  rsvp_status: RsvpStatus;
  locked: boolean;
}

export interface TablePlan extends SeatingTable {
  seats_used: number;
  guests: SeatedGuest[];
}

export interface PlanViolation {
  kind: string;
  message: string;
  guest_ids: string[];
  table_ids: string[];
}

export interface SeatingStats {
  tables: number;
  total_capacity: number;
  seats_needed: number;
  seats_assigned: number;
  guests_unassigned: number;
}

export interface SeatingPlan {
  event_id: string;
  tables: TablePlan[];
  unassigned: SeatedGuest[];
  violations: PlanViolation[];
  stats: SeatingStats;
}

export interface AssignmentUpdate {
  table_id: string | null;
  locked: boolean;
}

export interface AutoArrangeRequest {
  include_pending: boolean;
  keep_locked: boolean;
}

export interface UnplacedGuest {
  guest_id: string;
  full_name: string;
  reason: string;
}

export interface AutoArrangeResult {
  plan: SeatingPlan;
  unplaced: UnplacedGuest[];
}

export interface SeatingConstraint {
  id: string;
  guest_a_id: string;
  guest_a_name: string;
  guest_b_id: string;
  guest_b_name: string;
  kind: ConstraintKind;
  note: string | null;
}

export interface ConstraintCreate {
  guest_a_id: string;
  guest_b_id: string;
  kind: ConstraintKind;
  note?: string | null;
}

// --- Invitations ----------------------------------------------------------------------------

export type DraftStatus = "draft" | "sent";

export interface Draft {
  id: string;
  wedding_id: string;
  event_id: string;
  name: string;
  subject: string;
  body: string;
  design: InvitationDesign | null;
  status: DraftStatus;
  last_sent_at: ISODateTime | null;
  sent_count: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface DraftCreate {
  name?: string;
  subject?: string | null;
  body?: string | null;
  design?: InvitationDesign | null;
  copy_from_draft_id?: string | null;
}

export interface DraftUpdate {
  name?: string;
  subject?: string;
  body?: string;
  design?: InvitationDesign;
}

export interface PreviewRequest {
  guest_id?: string | null;
  subject?: string | null;
  body?: string | null;
  design?: InvitationDesign | null;
}

export interface PreviewResponse {
  subject: string;
  text: string;
  html: string;
  unknown_placeholders: string[];
  guest_name: string;
  card: InvitationDesign;
  fonts: FontOption[];
}

export type Audience = "unsent" | "pending" | "opened_no_reply" | "not_opened" | "all" | "selected";

export interface SendRequest {
  audience: Audience;
  guest_ids?: string[];
  dry_run?: boolean;
}

export interface Recipient {
  guest_id: string;
  full_name: string;
  email: string | null;
}

export interface SendResult {
  dry_run: boolean;
  queued: Recipient[];
  skipped_no_email: Recipient[];
}

export interface TestSendRequest {
  email: string;
  guest_id?: string | null;
}

export type DeliveryStatus = "queued" | "sending" | "sent" | "failed" | "skipped";
export type DeliveryChannel = "email" | "manual";

export interface Delivery {
  id: string;
  event_id: string;
  draft_id: string | null;
  guest_id: string | null;
  guest_name: string | null;
  channel: DeliveryChannel;
  is_test: boolean;
  to_address: string | null;
  subject: string;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  created_at: ISODateTime;
  sent_at: ISODateTime | null;
}

export interface LinkOpenResult {
  rsvp_token: string;
  event_id: string;
}

// --- RSVP & replies -------------------------------------------------------------------------

export type Engagement = "not_sent" | "sent" | "opened" | "responded";

export interface RsvpEvent {
  event_id: string;
  name: string;
  kind: EventKind;
  starts_at: ISODateTime | null;
  ends_at: ISODateTime | null;
  venue_name: string | null;
  venue_address: string | null;
  details: string | null;
  rsvp_deadline: ISODate | null;
  plus_one_allowed: boolean;
  rsvp_status: RsvpStatus;
  plus_one_attending: boolean | null;
  plus_one_name: string | null;
  plus_one_dietary: string | null;
  card: InvitationDesign;
}

export interface RsvpView {
  first_name: string;
  full_name: string;
  couple_names: string;
  wedding_title: string;
  wedding_date: ISODate | null;
  dietary_requirements: string | null;
  message: string | null;
  has_responded: boolean;
  events: RsvpEvent[];
  fonts: FontOption[];
}

export interface RsvpEventResponse {
  event_id: string;
  attending: boolean;
  plus_one_attending: boolean | null;
  plus_one_name: string | null;
  plus_one_dietary: string | null;
}

export interface RsvpSubmit {
  responses: RsvpEventResponse[];
  dietary_requirements: string | null;
  message: string | null;
}

export interface ReplyRow {
  guest_id: string;
  invitation_id: string;
  full_name: string;
  email: string | null;
  group_name: string | null;
  age_group: AgeGroup;
  rsvp_token: string;
  plus_one_allowed: boolean;
  rsvp_status: RsvpStatus;
  plus_one_attending: boolean | null;
  plus_one_name: string | null;
  plus_one_dietary: string | null;
  dietary_requirements: string | null;
  guest_message: string | null;
  responded_at: ISODateTime | null;
  response_channel: ResponseChannel | null;
  first_sent_at: ISODateTime | null;
  last_sent_at: ISODateTime | null;
  first_clicked_at: ISODateTime | null;
  last_clicked_at: ISODateTime | null;
  click_count: number;
  engagement: Engagement;
}

export interface ReplyUpdate {
  rsvp_status: RsvpStatus;
  plus_one_attending?: boolean | null;
  plus_one_name?: string | null;
  plus_one_dietary?: string | null;
  dietary_requirements?: string | null;
  guest_message?: string | null;
}

export interface DietaryNote {
  name: string;
  requirements: string;
}

export interface EventReplySummary {
  event_id: string;
  event_name: string;
  kind: EventKind;
  invited: number;
  invites_sent: number;
  invites_not_sent: number;
  opened: number;
  opened_no_reply: number;
  attending: number;
  declined: number;
  pending: number;
  plus_ones_allowed: number;
  plus_ones_attending: number;
  confirmed_headcount: number;
  potential_headcount: number;
  children_attending: number;
  dietary: DietaryNote[];
}

export interface WeddingSummary {
  wedding_id: string;
  guests_total: number;
  guests_without_email: number;
  events: EventReplySummary[];
}
