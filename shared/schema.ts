import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, doublePrecision, integer, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accountTypes = ["individual", "business"] as const;
export type AccountType = typeof accountTypes[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  accountType: text("account_type").notNull().$type<AccountType>().default("individual"),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  trustScore: integer("trust_score").notNull().default(100),
  eventsCreatedToday: integer("events_created_today").notNull().default(0),
  lastEventCreatedAt: timestamp("last_event_created_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  businessProfile: one(businessProfiles, {
    fields: [users.id],
    references: [businessProfiles.userId],
  }),
  events: many(events),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  accountType: true,
}).extend({
  email: z.string().email("Invalid email address"),
  accountType: z.enum(accountTypes).optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailVerificationsRelations = relations(emailVerifications, ({ one }) => ({
  user: one(users, {
    fields: [emailVerifications.userId],
    references: [users.id],
  }),
}));

export const businessProfiles = pgTable("business_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  website: text("website"),
  contactInfo: text("contact_info"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const businessProfilesRelations = relations(businessProfiles, ({ one }) => ({
  user: one(users, {
    fields: [businessProfiles.userId],
    references: [users.id],
  }),
}));

export const insertBusinessProfileSchema = createInsertSchema(businessProfiles).omit({
  id: true,
  createdAt: true,
  isVerified: true,
});

export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfiles.$inferSelect;

export const eventCategories = [
  "food_truck",
  "performer",
  "market",
  "vendor",
  "community",
  "other"
] as const;

export type EventCategory = typeof eventCategories[number];

export const eventStatuses = ["pending", "approved", "rejected", "hidden"] as const;
export type EventStatus = typeof eventStatuses[number];

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").notNull().$type<EventCategory>(),
  description: text("description").notNull(),
  address: text("address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  imageUrl: text("image_url"),
  organizerName: text("organizer_name"),
  organizerContact: text("organizer_contact"),
  status: text("status").notNull().$type<EventStatus>().default("approved"),
  reportCount: integer("report_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  shareCount: integer("share_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("events_user_id_idx").on(table.userId),
  index("events_status_idx").on(table.status),
  index("events_category_idx").on(table.category),
  index("events_location_idx").on(table.latitude, table.longitude),
]);

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  reports: many(eventReports),
  eventTags: many(eventTags),
}));

// ============================================
// TAGS SYSTEM FOR DISCOVERY
// ============================================

export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tags_name_idx").on(table.name),
  index("tags_usage_count_idx").on(table.usageCount),
]);

export const tagsRelations = relations(tags, ({ many }) => ({
  eventTags: many(eventTags),
}));

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const eventTags = pgTable("event_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_tags_event_id_idx").on(table.eventId),
  index("event_tags_tag_id_idx").on(table.tagId),
]);

export const eventTagsRelations = relations(eventTags, ({ one }) => ({
  event: one(events, {
    fields: [eventTags.eventId],
    references: [events.id],
  }),
  tag: one(tags, {
    fields: [eventTags.tagId],
    references: [tags.id],
  }),
}));

export type EventTag = typeof eventTags.$inferSelect;

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  reportCount: true,
  viewCount: true,
  likeCount: true,
  shareCount: true,
  status: true,
}).extend({
  name: z.string().min(1, "Event name is required").max(100, "Event name is too long"),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  category: z.enum(eventCategories),
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const reportReasons = [
  "spam",
  "inappropriate",
  "fake",
  "duplicate",
  "wrong_location",
  "expired",
  "other"
] as const;

export type ReportReason = typeof reportReasons[number];

export const eventReports = pgTable("event_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull().$type<ReportReason>(),
  details: text("details"),
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_reports_event_id_idx").on(table.eventId),
]);

export const eventReportsRelations = relations(eventReports, ({ one }) => ({
  event: one(events, {
    fields: [eventReports.eventId],
    references: [events.id],
  }),
  reporter: one(users, {
    fields: [eventReports.reporterId],
    references: [users.id],
  }),
}));

export const insertEventReportSchema = createInsertSchema(eventReports).omit({
  id: true,
  createdAt: true,
  isResolved: true,
}).extend({
  reason: z.enum(reportReasons),
});

export type InsertEventReport = z.infer<typeof insertEventReportSchema>;
export type EventReport = typeof eventReports.$inferSelect;

export const categoryLabels: Record<EventCategory, string> = {
  food_truck: "Food Truck",
  performer: "Performer",
  market: "Market",
  vendor: "Vendor",
  community: "Community",
  other: "Other"
};

export const categoryIcons: Record<EventCategory, string> = {
  food_truck: "UtensilsCrossed",
  performer: "Music",
  market: "ShoppingBag",
  vendor: "Store",
  community: "Users",
  other: "MapPin"
};

export const accountTypeLimits: Record<AccountType, { maxActiveEvents: number; eventsPerDay: number }> = {
  individual: { maxActiveEvents: 15, eventsPerDay: 3 },
  business: { maxActiveEvents: 50, eventsPerDay: 10 },
};

// ============================================
// TRAFFIC & NAVIGATION SYSTEM
// ============================================

// Road segment for tracking traffic data
// Segments are identified by OSM way ID or computed hash of coordinates
export const roadSegments = pgTable("road_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  osmWayId: text("osm_way_id"), // Optional OSM reference
  startLat: doublePrecision("start_lat").notNull(),
  startLng: doublePrecision("start_lng").notNull(),
  endLat: doublePrecision("end_lat").notNull(),
  endLng: doublePrecision("end_lng").notNull(),
  speedLimit: integer("speed_limit"), // km/h if available from OSM
  roadType: text("road_type"), // primary, secondary, residential, etc.
  avgSpeed: doublePrecision("avg_speed"), // Current average speed km/h
  trafficLevel: text("traffic_level").$type<TrafficLevel>().default("free"), // free, moderate, slow
  sampleCount: integer("sample_count").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("road_segments_coords_idx").on(table.startLat, table.startLng),
]);

export const trafficLevels = ["free", "moderate", "slow"] as const;
export type TrafficLevel = typeof trafficLevels[number];

export type RoadSegment = typeof roadSegments.$inferSelect;
export type InsertRoadSegment = typeof roadSegments.$inferInsert;

// Historical speed data for time-of-day patterns
export const speedHistory = pgTable("speed_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  segmentId: varchar("segment_id").notNull().references(() => roadSegments.id, { onDelete: "cascade" }),
  hourOfDay: integer("hour_of_day").notNull(), // 0-23
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 6=Saturday
  avgSpeed: doublePrecision("avg_speed").notNull(),
  sampleCount: integer("sample_count").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("speed_history_segment_idx").on(table.segmentId),
]);

export type SpeedHistory = typeof speedHistory.$inferSelect;

// Anonymous speed contributions from users
export const speedContributions = pgTable("speed_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  segmentId: varchar("segment_id").references(() => roadSegments.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  speed: doublePrecision("speed").notNull(), // km/h
  heading: doublePrecision("heading"), // 0-360 degrees
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  sessionHash: text("session_hash"), // Anonymous session identifier (not user ID)
});

export type SpeedContribution = typeof speedContributions.$inferSelect;

// Traffic incidents reported by users
export const incidentTypes = [
  "accident",
  "road_closed", 
  "construction",
  "police",
  "hazard",
  "congestion"
] as const;
export type IncidentType = typeof incidentTypes[number];

export const trafficIncidents = pgTable("traffic_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<IncidentType>(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  description: text("description"),
  reporterId: varchar("reporter_id").references(() => users.id, { onDelete: "set null" }),
  confirmations: integer("confirmations").notNull().default(1),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("traffic_incidents_active_idx").on(table.isActive),
  index("traffic_incidents_location_idx").on(table.latitude, table.longitude),
]);

export type TrafficIncident = typeof trafficIncidents.$inferSelect;

export const insertTrafficIncidentSchema = createInsertSchema(trafficIncidents).omit({
  id: true,
  createdAt: true,
  confirmations: true,
  isActive: true,
}).extend({
  type: z.enum(incidentTypes),
  latitude: z.number(),
  longitude: z.number(),
  description: z.string().optional(),
});

export type InsertTrafficIncident = z.infer<typeof insertTrafficIncidentSchema>;

// Road features from OSM (stop signs, traffic lights)
export const roadFeatureTypes = [
  "traffic_signals",
  "stop_sign", 
  "speed_camera",
  "crossing"
] as const;
export type RoadFeatureType = typeof roadFeatureTypes[number];

export const roadFeatures = pgTable("road_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<RoadFeatureType>(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  osmNodeId: text("osm_node_id"), // Reference to OSM node if available
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("road_features_location_idx").on(table.latitude, table.longitude),
  index("road_features_type_idx").on(table.type),
]);

export type RoadFeature = typeof roadFeatures.$inferSelect;

// Incident type labels and icons for UI
export const incidentLabels: Record<IncidentType, string> = {
  accident: "Accident",
  road_closed: "Road Closed",
  construction: "Construction",
  police: "Police",
  hazard: "Hazard",
  congestion: "Heavy Traffic"
};

export const roadFeatureLabels: Record<RoadFeatureType, string> = {
  traffic_signals: "Traffic Light",
  stop_sign: "Stop Sign",
  speed_camera: "Speed Camera",
  crossing: "Pedestrian Crossing"
};

// ============================================
// COMMUNITY ENGAGEMENT SYSTEM
// ============================================

// Event likes - tracks which users liked which events
export const eventLikes = pgTable("event_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_likes_event_id_idx").on(table.eventId),
  index("event_likes_user_id_idx").on(table.userId),
]);

export const eventLikesRelations = relations(eventLikes, ({ one }) => ({
  event: one(events, {
    fields: [eventLikes.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventLikes.userId],
    references: [users.id],
  }),
}));

export type EventLike = typeof eventLikes.$inferSelect;
export type InsertEventLike = typeof eventLikes.$inferInsert;

// Event comments - user comments on events
export const eventComments = pgTable("event_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_comments_event_id_idx").on(table.eventId),
  index("event_comments_user_id_idx").on(table.userId),
]);

export const eventCommentsRelations = relations(eventComments, ({ one }) => ({
  event: one(events, {
    fields: [eventComments.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventComments.userId],
    references: [users.id],
  }),
}));

export const insertEventCommentSchema = createInsertSchema(eventComments).omit({
  id: true,
  createdAt: true,
}).extend({
  content: z.string().min(1, "Comment cannot be empty").max(500, "Comment too long"),
});

export type EventComment = typeof eventComments.$inferSelect;
export type InsertEventComment = z.infer<typeof insertEventCommentSchema>;

// Event shares - track share count for analytics
export const eventShares = pgTable("event_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  shareType: text("share_type").notNull(), // 'copy_link', 'native_share', etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_shares_event_id_idx").on(table.eventId),
]);

export type EventShare = typeof eventShares.$inferSelect;
export type InsertEventShare = typeof eventShares.$inferInsert;

// ============================================
// MOBILE APP STORE COMPLIANCE
// ============================================

export const devicePlatforms = ["ios", "android", "web"] as const;
export type DevicePlatform = typeof devicePlatforms[number];

export const deviceTokens = pgTable("device_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  platform: text("platform").notNull().$type<DevicePlatform>(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("device_tokens_user_id_idx").on(table.userId),
]);

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, {
    fields: [deviceTokens.userId],
    references: [users.id],
  }),
}));

export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({
  id: true,
  lastUsedAt: true,
  createdAt: true,
}).extend({
  platform: z.enum(devicePlatforms),
});

export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokens.$inferSelect;

export const consentTypes = ["terms", "privacy", "notifications", "location", "contact_lead"] as const;
export type ConsentType = typeof consentTypes[number];

export const dataConsents = pgTable("data_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull().$type<ConsentType>(),
  grantedAt: timestamp("granted_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("data_consents_user_id_idx").on(table.userId),
]);

export const dataConsentsRelations = relations(dataConsents, ({ one }) => ({
  user: one(users, {
    fields: [dataConsents.userId],
    references: [users.id],
  }),
}));

export const insertDataConsentSchema = createInsertSchema(dataConsents).omit({
  id: true,
  grantedAt: true,
  revokedAt: true,
}).extend({
  consentType: z.enum(consentTypes),
});

export type InsertDataConsent = z.infer<typeof insertDataConsentSchema>;
export type DataConsent = typeof dataConsents.$inferSelect;

export const deletionRequestStatuses = ["pending", "verified", "processing", "completed"] as const;
export type DeletionRequestStatus = typeof deletionRequestStatuses[number];

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<DeletionRequestStatus>().default("pending"),
  reason: text("reason"),
  verificationToken: text("verification_token"),
  requestedAt: timestamp("requested_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("account_deletion_requests_user_id_idx").on(table.userId),
]);

export const accountDeletionRequestsRelations = relations(accountDeletionRequests, ({ one }) => ({
  user: one(users, {
    fields: [accountDeletionRequests.userId],
    references: [users.id],
  }),
}));

export const insertAccountDeletionRequestSchema = createInsertSchema(accountDeletionRequests).omit({
  id: true,
  status: true,
  verificationToken: true,
  requestedAt: true,
  verifiedAt: true,
  completedAt: true,
}).extend({
  reason: z.string().optional(),
});

export type InsertAccountDeletionRequest = z.infer<typeof insertAccountDeletionRequestSchema>;
export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;

// Extended event type with engagement counts
export interface EventWithEngagement extends Event {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLikedByUser: boolean;
}

// Comment with user info for display
export interface CommentWithUser extends EventComment {
  userEmail: string;
}
