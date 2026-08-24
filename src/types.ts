export type Language = "ru" | "uk" | "cs" | "en";
export type AppView = "home" | "discover" | "explore" | "bookings" | "create" | "profile";
export type UserRole = "user" | "organizer" | "professional" | "moderator" | "admin" | "superadmin";
export type ActivityType = "sport" | "dating" | "friends" | "food" | "travel" | "culture" | "local" | "custom";
export type SportLevel = "beginner" | "intermediate" | "advanced";
export type SportFormat = "casual" | "training" | "competition";
export type SportEnvironment = "indoor" | "outdoor";
export type CoachRequestType = "organizer_request" | "participant_interest";
export type CoachRequestStatus = "pending" | "matched" | "confirmed" | "cancelled" | "completed" | "rejected";
export type CoachPaymentMode = "organizer" | "split" | "free" | "unknown";

export type SportMetadata = {
  sportType?: string;
  level?: SportLevel;
  format?: SportFormat;
  environment?: SportEnvironment;
  equipmentNeeded?: boolean;
  equipment?: string;
  bring?: string;
  requirements?: string;
  organizerTips?: string;
  durationMinutes?: number;
};

export type ActivityMetadata = {
  sport?: SportMetadata;
  dating?: Record<string, unknown>;
  friends?: Record<string, unknown>;
  food?: Record<string, unknown>;
  travel?: Record<string, unknown>;
  custom?: Record<string, unknown>;
};

export type Category = {
  id: string;
  icon: string;
  name: Record<Language, string>;
};

export type ActivityMember = {
  userKey: string;
  name: string;
  status: "joined" | "waiting" | "pending";
};

export type Activity = {
  id: string;
  type?: ActivityType;
  categoryId: string;
  activity: Record<Language, string>;
  title: Record<Language, string>;
  description: Record<Language, string>;
  date: string;
  time: string;
  cityId: string;
  address: string;
  locationUrl?: string;
  participantNote?: string;
  price: number;
  capacity: number;
  participants: number;
  members: ActivityMember[];
  organizer: string;
  organizerKey: string;
  visibility: "public" | "private" | "invite";
  urgent?: boolean;
  popular?: boolean;
  metadata?: ActivityMetadata;
  seriesId?: string;
  seriesOccurrenceNo?: number;
  seriesOccurrenceStatus?: "scheduled" | "cancelled";
};

export type NewActivity = Omit<Activity, "id" | "participants" | "members" | "organizer" | "organizerKey" | "activity" | "title" | "description" | "seriesId" | "seriesOccurrenceNo" | "seriesOccurrenceStatus"> & {
  titleText: string;
  descriptionText: string;
  activityText: string;
};

export type CoachProfile = {
  id: string;
  userKey: string;
  displayName: string;
  city?: string;
  bio?: string;
  sports: string[];
  languages: string[];
  priceFrom?: number;
  priceCurrency: string;
  isVerified: boolean;
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
  ratingWeighted: number;
  createdAt: string;
  updatedAt: string;
};

export type CoachRequest = {
  id: string;
  activityId: string;
  requesterUserKey: string;
  coachProfileId?: string;
  requestType: CoachRequestType;
  sportType?: string;
  goal?: string;
  level?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode: CoachPaymentMode;
  status: CoachRequestStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type CoachReview = {
  id: string;
  coachProfileId: string;
  activityId: string;
  reviewerUserKey: string;
  overallRating: number;
  communicationRating?: number;
  punctualityRating?: number;
  trainingQualityRating?: number;
  beginnerFriendlinessRating?: number;
  tags: string[];
  comment?: string;
  isPublic: boolean;
  createdAt: string;
};

export type ActivityChatStatus = "active" | "expired" | "archived" | "deleted";

export type ActivityChatMessageStatus = "visible" | "deleted" | "hidden_by_moderator";

export type ActivityChat = {
  id: string;
  activityId: string;
  createdByUserKey: string;
  status: ActivityChatStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityChatMessage = {
  id: string;
  chatId: string;
  activityId: string;
  senderUserKey: string;
  senderDisplayName?: string | null;
  body: string;
  status: ActivityChatMessageStatus;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
};
