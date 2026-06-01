import { 
  type User, type InsertUser, type Event, type InsertEvent, type EventCategory,
  type BusinessProfile, type InsertBusinessProfile,
  type EventReport, type InsertEventReport,
  type TrafficIncident, type InsertTrafficIncident, type RoadSegment, type RoadFeature,
  type TrafficLevel,
  type EventLike, type InsertEventLike,
  type EventComment, type InsertEventComment, type CommentWithUser,
  type EventShare, type InsertEventShare,
  type EventWithEngagement,
  type Tag, type EventTag,
  type DeviceToken, type InsertDeviceToken,
  type DataConsent, type InsertDataConsent,
  type AccountDeletionRequest, type InsertAccountDeletionRequest,
  users, events, businessProfiles, emailVerifications, eventReports,
  trafficIncidents, roadSegments, roadFeatures, speedContributions,
  eventLikes, eventComments, eventShares,
  tags, eventTags,
  deviceTokens, dataConsents, accountDeletionRequests
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, ilike, or, sql, desc, lt, inArray } from "drizzle-orm";
import { addHours } from "date-fns";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  createEmailVerification(userId: string, token: string, expiresAt: Date): Promise<void>;
  getEmailVerification(token: string): Promise<{ userId: string; expiresAt: Date } | undefined>;
  deleteEmailVerification(token: string): Promise<void>;
  verifyUserEmail(userId: string): Promise<void>;
  
  getBusinessProfile(userId: string): Promise<BusinessProfile | undefined>;
  createBusinessProfile(profile: InsertBusinessProfile): Promise<BusinessProfile>;
  updateBusinessProfile(userId: string, updates: Partial<BusinessProfile>): Promise<BusinessProfile | undefined>;
  
  getAllEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventsByUser(userId: string): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  getEventsByCategory(category: EventCategory): Promise<Event[]>;
  getEventsByDateRange(start: Date, end: Date): Promise<Event[]>;
  getEventsNearLocation(lat: number, lng: number, radiusMiles: number): Promise<Event[]>;
  searchEvents(query: string): Promise<Event[]>;
  incrementEventReportCount(eventId: string): Promise<void>;
  
  createEventReport(report: InsertEventReport): Promise<EventReport>;
  getEventReports(eventId: string): Promise<EventReport[]>;
  
  // Community engagement
  likeEvent(eventId: string, userId: string): Promise<EventLike>;
  unlikeEvent(eventId: string, userId: string): Promise<boolean>;
  getEventLikeStatus(eventId: string, userId: string): Promise<boolean>;
  getEventLikeCount(eventId: string): Promise<number>;
  
  createComment(comment: InsertEventComment): Promise<EventComment>;
  getEventComments(eventId: string): Promise<CommentWithUser[]>;
  deleteComment(commentId: string, userId: string): Promise<boolean>;
  getEventCommentCount(eventId: string): Promise<number>;
  
  recordShare(eventId: string, userId: string | null, shareType: string): Promise<EventShare>;
  getEventShareCount(eventId: string): Promise<number>;
  
  getEventsWithEngagement(userId?: string): Promise<EventWithEngagement[]>;
  getEventEngagement(eventId: string, userId?: string): Promise<{ likeCount: number; commentCount: number; shareCount: number; isLikedByUser: boolean }>;
  
  // Tag management for discovery
  getAllTags(): Promise<Tag[]>;
  getPopularTags(limit: number): Promise<Tag[]>;
  getEventTags(eventId: string): Promise<Tag[]>;
  getTagsForEvents(eventIds: string[]): Promise<Record<string, Tag[]>>;
  createTag(name: string): Promise<Tag>;
  getOrCreateTag(name: string): Promise<Tag>;
  addTagToEvent(eventId: string, tagId: string): Promise<EventTag>;
  removeTagFromEvent(eventId: string, tagId: string): Promise<boolean>;
  setEventTags(eventId: string, tagNames: string[]): Promise<Tag[]>;
  
  // User stats for profile
  getUserStats(userId: string): Promise<{ likesGiven: number; commentsMade: number; totalViews: number }>;
  
  // Public user profile
  getPublicUserProfile(userId: string): Promise<{
    id: string;
    displayName: string;
    accountType: string;
    trustScore: number;
    createdAt: Date | null;
    eventsCreated: number;
    likesReceived: number;
    totalViews: number;
  } | null>;

  // Device tokens
  saveDeviceToken(userId: string, token: string, platform: string): Promise<DeviceToken>;
  getDeviceTokensByUser(userId: string): Promise<DeviceToken[]>;
  deleteDeviceToken(token: string): Promise<boolean>;
  getDeviceTokensForNotification(userIds: string[]): Promise<DeviceToken[]>;

  // Data consents
  recordConsent(data: InsertDataConsent): Promise<DataConsent>;
  getUserConsents(userId: string): Promise<DataConsent[]>;
  revokeConsent(userId: string, consentType: string): Promise<void>;

  // Account deletion
  createDeletionRequest(userId: string, reason?: string): Promise<AccountDeletionRequest>;
  getDeletionRequest(userId: string): Promise<AccountDeletionRequest | undefined>;
  verifyDeletionRequest(id: string, token: string): Promise<boolean>;
  processDeletion(userId: string): Promise<void>;

  // Data export
  exportUserData(userId: string): Promise<object>;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ 
        ...insertUser, 
        email: insertUser.email.toLowerCase(),
        isEmailVerified: true // Auto-verify for now (email verification disabled)
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async createEmailVerification(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(emailVerifications).values({ userId, token, expiresAt });
  }

  async getEmailVerification(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const [verification] = await db
      .select({ userId: emailVerifications.userId, expiresAt: emailVerifications.expiresAt })
      .from(emailVerifications)
      .where(eq(emailVerifications.token, token));
    return verification || undefined;
  }

  async deleteEmailVerification(token: string): Promise<void> {
    await db.delete(emailVerifications).where(eq(emailVerifications.token, token));
  }

  async verifyUserEmail(userId: string): Promise<void> {
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userId));
  }

  async getBusinessProfile(userId: string): Promise<BusinessProfile | undefined> {
    const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
    return profile || undefined;
  }

  async createBusinessProfile(profile: InsertBusinessProfile): Promise<BusinessProfile> {
    const [created] = await db.insert(businessProfiles).values(profile).returning();
    return created;
  }

  async updateBusinessProfile(userId: string, updates: Partial<BusinessProfile>): Promise<BusinessProfile | undefined> {
    const [updated] = await db
      .update(businessProfiles)
      .set(updates)
      .where(eq(businessProfiles.userId, userId))
      .returning();
    return updated || undefined;
  }

  async getAllEvents(): Promise<Event[]> {
    const now = new Date();
    return db
      .select()
      .from(events)
      .where(and(
        gte(events.endDate, now),
        eq(events.status, "approved")
      ))
      .orderBy(events.startDate);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async getEventsByUser(userId: string): Promise<Event[]> {
    return db.select().from(events).where(eq(events.userId, userId)).orderBy(desc(events.createdAt));
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const [event] = await db
      .insert(events)
      .values({
        ...insertEvent,
        startDate: new Date(insertEvent.startDate),
        endDate: new Date(insertEvent.endDate),
      })
      .returning();
    return event;
  }

  async updateEvent(id: string, updates: Partial<InsertEvent>): Promise<Event | undefined> {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.startDate) updateData.startDate = new Date(updates.startDate);
    if (updates.endDate) updateData.endDate = new Date(updates.endDate);
    
    const [event] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();
    return event || undefined;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventsByCategory(category: EventCategory): Promise<Event[]> {
    const now = new Date();
    return db
      .select()
      .from(events)
      .where(and(
        eq(events.category, category),
        gte(events.endDate, now),
        eq(events.status, "approved")
      ))
      .orderBy(events.startDate);
  }

  async getEventsByDateRange(start: Date, end: Date): Promise<Event[]> {
    return db
      .select()
      .from(events)
      .where(and(
        gte(events.startDate, start),
        lte(events.startDate, end),
        eq(events.status, "approved")
      ))
      .orderBy(events.startDate);
  }

  async getEventsNearLocation(lat: number, lng: number, radiusMiles: number): Promise<Event[]> {
    const allEvents = await this.getAllEvents();
    return allEvents.filter(event => {
      const distance = calculateDistance(lat, lng, event.latitude, event.longitude);
      return distance <= radiusMiles;
    });
  }

  async searchEvents(query: string): Promise<Event[]> {
    const now = new Date();
    const searchPattern = `%${query}%`;
    return db
      .select()
      .from(events)
      .where(and(
        gte(events.endDate, now),
        eq(events.status, "approved"),
        or(
          ilike(events.name, searchPattern),
          ilike(events.description, searchPattern),
          ilike(events.address, searchPattern)
        )
      ))
      .orderBy(events.startDate);
  }

  async incrementEventReportCount(eventId: string): Promise<void> {
    await db
      .update(events)
      .set({ reportCount: sql`${events.reportCount} + 1` })
      .where(eq(events.id, eventId));
    
    const [event] = await db.select({ reportCount: events.reportCount }).from(events).where(eq(events.id, eventId));
    if (event && event.reportCount >= 3) {
      await db.update(events).set({ status: "hidden" }).where(eq(events.id, eventId));
    }
  }

  async createEventReport(report: InsertEventReport): Promise<EventReport> {
    const [created] = await db.insert(eventReports).values(report).returning();
    await this.incrementEventReportCount(report.eventId);
    return created;
  }

  async getEventReports(eventId: string): Promise<EventReport[]> {
    return db.select().from(eventReports).where(eq(eventReports.eventId, eventId));
  }

  // ============================================
  // TRAFFIC & NAVIGATION METHODS
  // ============================================

  async getTrafficIncidents(bounds?: { north: number; south: number; east: number; west: number }): Promise<TrafficIncident[]> {
    const now = new Date();
    if (bounds) {
      return db
        .select()
        .from(trafficIncidents)
        .where(and(
          eq(trafficIncidents.isActive, true),
          gte(trafficIncidents.expiresAt, now),
          gte(trafficIncidents.latitude, bounds.south),
          lte(trafficIncidents.latitude, bounds.north),
          gte(trafficIncidents.longitude, bounds.west),
          lte(trafficIncidents.longitude, bounds.east)
        ));
    }
    return db
      .select()
      .from(trafficIncidents)
      .where(and(
        eq(trafficIncidents.isActive, true),
        gte(trafficIncidents.expiresAt, now)
      ));
  }

  async createTrafficIncident(incident: InsertTrafficIncident): Promise<TrafficIncident> {
    const expiresAt = incident.expiresAt || addHours(new Date(), 2);
    const [created] = await db
      .insert(trafficIncidents)
      .values({ ...incident, expiresAt })
      .returning();
    return created;
  }

  async confirmTrafficIncident(id: string): Promise<TrafficIncident | undefined> {
    const [updated] = await db
      .update(trafficIncidents)
      .set({ confirmations: sql`${trafficIncidents.confirmations} + 1` })
      .where(eq(trafficIncidents.id, id))
      .returning();
    return updated;
  }

  async dismissTrafficIncident(id: string): Promise<void> {
    await db
      .update(trafficIncidents)
      .set({ isActive: false })
      .where(eq(trafficIncidents.id, id));
  }

  async cleanupExpiredIncidents(): Promise<void> {
    const now = new Date();
    await db
      .update(trafficIncidents)
      .set({ isActive: false })
      .where(lt(trafficIncidents.expiresAt, now));
  }

  async getRoadFeatures(bounds: { north: number; south: number; east: number; west: number }): Promise<RoadFeature[]> {
    // Fetch road features from OpenStreetMap Overpass API in real-time
    return this.fetchRoadFeaturesFromOSM(bounds);
  }

  async getRoadFeaturesForRoute(
    bounds: { north: number; south: number; east: number; west: number },
    routeNodeIds: number[]
  ): Promise<RoadFeature[]> {
    // Topological filtering: only return features that are on the route's OSM nodes
    return this.fetchRoadFeaturesForRoute(bounds, routeNodeIds);
  }

  async getRoadSegments(bounds: { north: number; south: number; east: number; west: number }): Promise<RoadSegment[]> {
    return db
      .select()
      .from(roadSegments)
      .where(and(
        gte(roadSegments.startLat, bounds.south),
        lte(roadSegments.startLat, bounds.north),
        gte(roadSegments.startLng, bounds.west),
        lte(roadSegments.startLng, bounds.east)
      ));
  }

  async submitSpeedData(data: { latitude: number; longitude: number; speed: number; heading?: number; sessionHash?: string }): Promise<void> {
    await db.insert(speedContributions).values({
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      heading: data.heading,
      sessionHash: data.sessionHash,
      timestamp: new Date()
    });
  }

  async getOrCreateRoadSegment(startLat: number, startLng: number, endLat: number, endLng: number): Promise<RoadSegment> {
    const tolerance = 0.0001;
    const [existing] = await db
      .select()
      .from(roadSegments)
      .where(and(
        gte(roadSegments.startLat, startLat - tolerance),
        lte(roadSegments.startLat, startLat + tolerance),
        gte(roadSegments.startLng, startLng - tolerance),
        lte(roadSegments.startLng, startLng + tolerance)
      ))
      .limit(1);
    
    if (existing) return existing;

    const [created] = await db
      .insert(roadSegments)
      .values({ startLat, startLng, endLat, endLng })
      .returning();
    return created;
  }

  async updateSegmentTraffic(segmentId: string, avgSpeed: number, trafficLevel: TrafficLevel): Promise<void> {
    await db
      .update(roadSegments)
      .set({
        avgSpeed,
        trafficLevel,
        sampleCount: sql`${roadSegments.sampleCount} + 1`,
        lastUpdated: new Date()
      })
      .where(eq(roadSegments.id, segmentId));
  }

  async seedRoadFeatures(): Promise<void> {
    // Road features are now fetched dynamically from OSM, no seeding needed
    // Clear any old sample data
    await db.delete(roadFeatures);
  }

  // Fetch road features from OpenStreetMap Overpass API
  async fetchRoadFeaturesFromOSM(bounds: { north: number; south: number; east: number; west: number }): Promise<RoadFeature[]> {
    try {
      // Query OSM for traffic signals and stop signs in the bounding box
      // Exclude: overpasses (layer > 0), motorways, motorway links, trunk roads
      const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
      console.log(`Fetching OSM road features for bbox: ${bbox}`);
      
      // Query traffic signals and stop signs along with their parent ways
      // This allows us to filter out nodes that are on motorways/freeways
      const query = `
        [out:json][timeout:25];
        (
          node["highway"="traffic_signals"](${bbox});
          node["highway"="stop"](${bbox});
        )->.signals;
        way(bn.signals)["highway"]->.parentways;
        .signals out body;
        .parentways out body;
      `;
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        console.error('OSM Overpass API error:', response.status);
        return [];
      }

      const data = await response.json();
      const elements = data.elements || [];
      
      // Separate nodes and ways
      const nodes = elements.filter((e: any) => e.type === 'node');
      const ways = elements.filter((e: any) => e.type === 'way');
      
      console.log(`OSM returned ${nodes.length} signal nodes and ${ways.length} parent ways`);
      
      // Build a map of node IDs to their parent ways' highway types
      const nodeToHighwayTypes = new Map<number, Set<string>>();
      const nodeToLayers = new Map<number, Set<number>>();
      
      for (const way of ways) {
        const highwayType = way.tags?.highway;
        const layer = parseInt(way.tags?.layer || '0', 10);
        
        if (highwayType && way.nodes) {
          for (const nodeId of way.nodes) {
            if (!nodeToHighwayTypes.has(nodeId)) {
              nodeToHighwayTypes.set(nodeId, new Set());
            }
            nodeToHighwayTypes.get(nodeId)!.add(highwayType);
            
            if (!nodeToLayers.has(nodeId)) {
              nodeToLayers.set(nodeId, new Set());
            }
            nodeToLayers.get(nodeId)!.add(layer);
          }
        }
      }
      
      // Filter nodes: exclude those ONLY on high-speed roads or on non-ground levels
      const excludedHighways = new Set([
        'motorway', 'motorway_link', 
        'trunk', 'trunk_link'
      ]);
      
      const filteredNodes = nodes.filter((node: any) => {
        const nodeId = node.id;
        const highwayTypes = nodeToHighwayTypes.get(nodeId);
        const layers = nodeToLayers.get(nodeId);
        
        // Check if node is on any non-ground layer
        if (layers) {
          const hasGroundLevel = layers.has(0);
          const hasNonGroundLevel = Array.from(layers).some(l => l !== 0);
          // If only on non-ground levels, exclude it
          if (hasNonGroundLevel && !hasGroundLevel) {
            return false;
          }
        }
        
        // Check highway types - exclude if ONLY on motorways
        if (highwayTypes) {
          const onlyOnMotorways = Array.from(highwayTypes).every(t => excludedHighways.has(t));
          if (onlyOnMotorways) {
            return false;
          }
        }
        
        // Exclude ramp meters
        if (node.tags?.traffic_signals === 'ramp_meter') {
          return false;
        }
        
        return true;
      });
      
      console.log(`After filtering: ${filteredNodes.length} valid road features`);
      
      const features: RoadFeature[] = filteredNodes.map((element: any) => ({
        id: `osm-${element.id}`,
        type: element.tags?.highway === 'stop' ? 'stop_sign' : 'traffic_signals',
        latitude: element.lat,
        longitude: element.lon,
        name: element.tags?.name || null
      }));

      return features;
    } catch (error) {
      console.error('Error fetching OSM road features:', error);
      return [];
    }
  }

  // Cache for road features to handle Overpass API failures
  private roadFeaturesCache: Map<string, { features: RoadFeature[], timestamp: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // Topological filtering: only return traffic signals that are ON the route's OSM nodes
  async fetchRoadFeaturesForRoute(
    bounds: { north: number; south: number; east: number; west: number },
    routeNodeIds: number[]
  ): Promise<RoadFeature[]> {
    try {
      if (routeNodeIds.length === 0) {
        console.log('No route node IDs provided, returning empty features');
        return [];
      }

      // Create cache key from route nodes (using first/last few nodes as identifier)
      const cacheKey = `${routeNodeIds.slice(0, 5).join(',')}-${routeNodeIds.slice(-5).join(',')}`;
      const cached = this.roadFeaturesCache.get(cacheKey);
      
      // Check if we have valid cached data
      const now = Date.now();
      if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
        console.log(`Using cached road features (${cached.features.length} items)`);
        return cached.features;
      }

      const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
      console.log(`Fetching route-aware OSM features for ${routeNodeIds.length} route nodes`);
      
      // Create a Set for O(1) lookup of route nodes
      const routeNodeSet = new Set(routeNodeIds);
      
      // Query traffic signals and stop signs in the bounding box
      const query = `
        [out:json][timeout:90];
        (
          node["highway"="traffic_signals"](${bbox});
          node["highway"="stop"](${bbox});
        );
        out body 2000;
      `;
      
      // Multiple Overpass servers for reliability - try different ones in rotation
      const overpassServers = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.openstreetmap.ru/api/interpreter'
      ];
      
      let nodes: any[] = [];
      let lastError: any = null;
      
      // Try each server with retries
      for (const server of overpassServers) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`Trying Overpass server: ${server} (attempt ${attempt})`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout
            
            const response = await fetch(server, {
              method: 'POST',
              body: `data=${encodeURIComponent(query)}`,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Spotly-LocalDiscovery/1.0'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              nodes = (data.elements || []).filter((e: any) => e.type === 'node');
              console.log(`OSM returned ${nodes.length} signal nodes from ${server}`);
              break;
            } else {
              console.error(`Overpass API error from ${server}: ${response.status}`);
              lastError = new Error(`HTTP ${response.status}`);
            }
          } catch (err: any) {
            console.error(`Overpass request failed for ${server}:`, err.message);
            lastError = err;
            // Wait before retry with exponential backoff
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, attempt * 2000));
            }
          }
        }
        
        if (nodes.length > 0) break; // Success, stop trying other servers
      }
      
      // If all servers failed, return cached data even if stale
      if (nodes.length === 0) {
        console.log('All Overpass servers failed');
        if (cached) {
          console.log(`Returning stale cached data (${cached.features.length} items)`);
          return cached.features;
        }
        return [];
      }
      
      // TOPOLOGICAL FILTER: Only include nodes that are IN the route's node list
      // This ensures we only show signals the driver will actually encounter
      const routeSignals = nodes.filter((node: any) => {
        const isOnRoute = routeNodeSet.has(node.id);
        if (isOnRoute) {
          console.log(`Signal node ${node.id} is ON the route`);
        }
        return isOnRoute;
      });
      
      console.log(`After topological filtering: ${routeSignals.length} signals on route`);
      
      const features: RoadFeature[] = routeSignals.map((element: any) => ({
        id: `osm-${element.id}`,
        type: element.tags?.highway === 'stop' ? 'stop_sign' : 'traffic_signals',
        latitude: element.lat,
        longitude: element.lon,
        name: element.tags?.name || null,
        osmNodeId: String(element.id),
        createdAt: null
      }));

      // Cache the successful result
      this.roadFeaturesCache.set(cacheKey, { features, timestamp: now });
      
      // Clean up old cache entries (keep last 20)
      if (this.roadFeaturesCache.size > 20) {
        const oldestKey = this.roadFeaturesCache.keys().next().value;
        if (oldestKey) this.roadFeaturesCache.delete(oldestKey);
      }

      return features;
    } catch (error) {
      console.error('Error fetching route-aware OSM features:', error);
      return [];
    }
  }

  async getUserStats(userId: string): Promise<{ likesGiven: number; commentsMade: number; totalViews: number }> {
    const [likesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventLikes)
      .where(eq(eventLikes.userId, userId));
    
    const [commentsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventComments)
      .where(eq(eventComments.userId, userId));
    
    const [viewsResult] = await db
      .select({ totalViews: sql<number>`coalesce(sum(view_count), 0)` })
      .from(events)
      .where(eq(events.userId, userId));
    
    return {
      likesGiven: Number(likesResult?.count || 0),
      commentsMade: Number(commentsResult?.count || 0),
      totalViews: Number(viewsResult?.totalViews || 0)
    };
  }

  async getPublicUserProfile(userId: string): Promise<{
    id: string;
    displayName: string;
    accountType: string;
    trustScore: number;
    createdAt: Date | null;
    eventsCreated: number;
    likesReceived: number;
    totalViews: number;
  } | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const [eventsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(eq(events.userId, userId));

    const [likesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventLikes)
      .innerJoin(events, eq(eventLikes.eventId, events.id))
      .where(eq(events.userId, userId));

    const [viewsResult] = await db
      .select({ totalViews: sql<number>`coalesce(sum(view_count), 0)` })
      .from(events)
      .where(eq(events.userId, userId));

    const displayName = user.email.split("@")[0];

    return {
      id: user.id,
      displayName,
      accountType: user.accountType,
      trustScore: user.trustScore,
      createdAt: user.createdAt,
      eventsCreated: Number(eventsResult?.count || 0),
      likesReceived: Number(likesResult?.count || 0),
      totalViews: Number(viewsResult?.totalViews || 0)
    };
  }


  // ============================================
  // COMMUNITY ENGAGEMENT METHODS
  // ============================================

  async likeEvent(eventId: string, userId: string): Promise<EventLike> {
    // Check if already liked
    const [existing] = await db
      .select()
      .from(eventLikes)
      .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)));
    
    if (existing) {
      return existing;
    }

    const [like] = await db
      .insert(eventLikes)
      .values({ eventId, userId })
      .returning();
    return like;
  }

  async unlikeEvent(eventId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(eventLikes)
      .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventLikeStatus(eventId: string, userId: string): Promise<boolean> {
    const [like] = await db
      .select()
      .from(eventLikes)
      .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)));
    return !!like;
  }

  async getEventLikeCount(eventId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventLikes)
      .where(eq(eventLikes.eventId, eventId));
    return result?.count ?? 0;
  }

  async createComment(comment: InsertEventComment): Promise<EventComment> {
    const [created] = await db
      .insert(eventComments)
      .values(comment)
      .returning();
    return created;
  }

  async getEventComments(eventId: string): Promise<CommentWithUser[]> {
    const comments = await db
      .select({
        id: eventComments.id,
        eventId: eventComments.eventId,
        userId: eventComments.userId,
        content: eventComments.content,
        createdAt: eventComments.createdAt,
        userEmail: users.email,
      })
      .from(eventComments)
      .leftJoin(users, eq(eventComments.userId, users.id))
      .where(eq(eventComments.eventId, eventId))
      .orderBy(desc(eventComments.createdAt));
    
    return comments.map(c => ({
      ...c,
      userEmail: c.userEmail || 'Anonymous',
    }));
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(eventComments)
      .where(and(eq(eventComments.id, commentId), eq(eventComments.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getEventCommentCount(eventId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventComments)
      .where(eq(eventComments.eventId, eventId));
    return result?.count ?? 0;
  }

  async recordShare(eventId: string, userId: string | null, shareType: string): Promise<EventShare> {
    const [share] = await db
      .insert(eventShares)
      .values({ eventId, userId, shareType })
      .returning();
    return share;
  }

  async getEventShareCount(eventId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventShares)
      .where(eq(eventShares.eventId, eventId));
    return result?.count ?? 0;
  }

  async getEventEngagement(eventId: string, userId?: string): Promise<{ likeCount: number; commentCount: number; shareCount: number; isLikedByUser: boolean }> {
    const [likeCount, commentCount, shareCount, isLiked] = await Promise.all([
      this.getEventLikeCount(eventId),
      this.getEventCommentCount(eventId),
      this.getEventShareCount(eventId),
      userId ? this.getEventLikeStatus(eventId, userId) : Promise.resolve(false),
    ]);

    return { likeCount, commentCount, shareCount, isLikedByUser: isLiked };
  }

  async getEventsWithEngagement(userId?: string): Promise<EventWithEngagement[]> {
    const allEvents = await this.getAllEvents();
    
    const eventsWithEngagement = await Promise.all(
      allEvents.map(async (event) => {
        const engagement = await this.getEventEngagement(event.id, userId);
        return {
          ...event,
          ...engagement,
        };
      })
    );

    return eventsWithEngagement;
  }

  // ============================================
  // TAG MANAGEMENT FOR DISCOVERY
  // ============================================

  async getAllTags(): Promise<Tag[]> {
    return db.select().from(tags).orderBy(desc(tags.usageCount));
  }

  async getPopularTags(limit: number): Promise<Tag[]> {
    return db.select().from(tags).orderBy(desc(tags.usageCount)).limit(limit);
  }

  async getEventTags(eventId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(eventTags)
      .innerJoin(tags, eq(eventTags.tagId, tags.id))
      .where(eq(eventTags.eventId, eventId));
    return result.map(r => r.tag);
  }

  async getTagsForEvents(eventIds: string[]): Promise<Record<string, Tag[]>> {
    if (eventIds.length === 0) return {};
    
    const result = await db
      .select({ 
        eventId: eventTags.eventId,
        tag: tags 
      })
      .from(eventTags)
      .innerJoin(tags, eq(eventTags.tagId, tags.id))
      .where(inArray(eventTags.eventId, eventIds));
    
    const tagMap: Record<string, Tag[]> = {};
    for (const eventId of eventIds) {
      tagMap[eventId] = [];
    }
    for (const row of result) {
      if (!tagMap[row.eventId]) {
        tagMap[row.eventId] = [];
      }
      tagMap[row.eventId].push(row.tag);
    }
    return tagMap;
  }

  async createTag(name: string): Promise<Tag> {
    const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const [tag] = await db.insert(tags).values({ name: normalized }).returning();
    return tag;
  }

  async getOrCreateTag(name: string): Promise<Tag> {
    const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    if (!normalized) throw new Error("Invalid tag name");
    
    const existing = await db.select().from(tags).where(eq(tags.name, normalized)).limit(1);
    if (existing.length > 0) return existing[0];
    
    const [tag] = await db.insert(tags).values({ name: normalized }).returning();
    return tag;
  }

  async addTagToEvent(eventId: string, tagId: string): Promise<EventTag> {
    const [eventTag] = await db.insert(eventTags).values({ eventId, tagId }).returning();
    await db.update(tags).set({ usageCount: sql`${tags.usageCount} + 1` }).where(eq(tags.id, tagId));
    return eventTag;
  }

  async removeTagFromEvent(eventId: string, tagId: string): Promise<boolean> {
    const result = await db.delete(eventTags).where(
      and(eq(eventTags.eventId, eventId), eq(eventTags.tagId, tagId))
    ).returning();
    if (result.length > 0) {
      await db.update(tags).set({ usageCount: sql`GREATEST(0, ${tags.usageCount} - 1)` }).where(eq(tags.id, tagId));
      return true;
    }
    return false;
  }

  async setEventTags(eventId: string, tagNames: string[]): Promise<Tag[]> {
    // Remove existing tags
    const existingTags = await this.getEventTags(eventId);
    for (const tag of existingTags) {
      await this.removeTagFromEvent(eventId, tag.id);
    }
    
    // Add new tags (up to 10 per event)
    const uniqueNames = Array.from(new Set(tagNames.slice(0, 10)));
    const addedTags: Tag[] = [];
    
    for (const name of uniqueNames) {
      if (name.trim()) {
        const tag = await this.getOrCreateTag(name);
        await this.addTagToEvent(eventId, tag.id);
        addedTags.push(tag);
      }
    }
    
    return addedTags;
  }

  // ============================================
  // DEVICE TOKENS
  // ============================================

  async saveDeviceToken(userId: string, token: string, platform: string): Promise<DeviceToken> {
    const [existing] = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, token));

    if (existing) {
      const [updated] = await db
        .update(deviceTokens)
        .set({ userId, platform: platform as "ios" | "android" | "web", lastUsedAt: new Date() })
        .where(eq(deviceTokens.token, token))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(deviceTokens)
      .values({ userId, token, platform: platform as "ios" | "android" | "web" })
      .returning();
    return created;
  }

  async getDeviceTokensByUser(userId: string): Promise<DeviceToken[]> {
    return db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
  }

  async deleteDeviceToken(token: string): Promise<boolean> {
    const result = await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
    return (result.rowCount ?? 0) > 0;
  }

  async getDeviceTokensForNotification(userIds: string[]): Promise<DeviceToken[]> {
    if (userIds.length === 0) return [];
    return db.select().from(deviceTokens).where(inArray(deviceTokens.userId, userIds));
  }

  // ============================================
  // DATA CONSENTS
  // ============================================

  async recordConsent(data: InsertDataConsent): Promise<DataConsent> {
    const [created] = await db.insert(dataConsents).values(data).returning();
    return created;
  }

  async getUserConsents(userId: string): Promise<DataConsent[]> {
    return db.select().from(dataConsents).where(eq(dataConsents.userId, userId));
  }

  async revokeConsent(userId: string, consentType: string): Promise<void> {
    await db
      .update(dataConsents)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(dataConsents.userId, userId),
        eq(dataConsents.consentType, consentType as any)
      ));
  }

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  async createDeletionRequest(userId: string, reason?: string): Promise<AccountDeletionRequest> {
    const verificationToken = crypto.randomUUID();
    const [request] = await db
      .insert(accountDeletionRequests)
      .values({ userId, reason, verificationToken })
      .returning();
    return request;
  }

  async getDeletionRequest(userId: string): Promise<AccountDeletionRequest | undefined> {
    const [request] = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, userId))
      .orderBy(desc(accountDeletionRequests.requestedAt))
      .limit(1);
    return request || undefined;
  }

  async verifyDeletionRequest(id: string, token: string): Promise<boolean> {
    const [request] = await db
      .select()
      .from(accountDeletionRequests)
      .where(and(
        eq(accountDeletionRequests.id, id),
        eq(accountDeletionRequests.verificationToken, token)
      ));

    if (!request) return false;

    await db
      .update(accountDeletionRequests)
      .set({ status: "verified", verifiedAt: new Date() })
      .where(eq(accountDeletionRequests.id, id));
    return true;
  }

  async processDeletion(userId: string): Promise<void> {
    await db
      .update(accountDeletionRequests)
      .set({ status: "processing" })
      .where(eq(accountDeletionRequests.userId, userId));

    await db.delete(eventLikes).where(eq(eventLikes.userId, userId));
    await db.delete(eventComments).where(eq(eventComments.userId, userId));
    await db.delete(eventShares).where(eq(eventShares.userId, userId));
    await db.delete(eventReports).where(eq(eventReports.reporterId, userId));
    await db.delete(events).where(eq(events.userId, userId));
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
    await db.delete(businessProfiles).where(eq(businessProfiles.userId, userId));
    await db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    await db.delete(dataConsents).where(eq(dataConsents.userId, userId));

    await db
      .update(accountDeletionRequests)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(accountDeletionRequests.userId, userId));

    await db.delete(accountDeletionRequests).where(eq(accountDeletionRequests.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  // ============================================
  // DATA EXPORT
  // ============================================

  async exportUserData(userId: string): Promise<object> {
    const [user, userEvents, likes, comments, shares, consents, businessProfile] = await Promise.all([
      this.getUser(userId),
      this.getEventsByUser(userId),
      db.select().from(eventLikes).where(eq(eventLikes.userId, userId)),
      db.select().from(eventComments).where(eq(eventComments.userId, userId)),
      db.select().from(eventShares).where(eq(eventShares.userId, userId)),
      this.getUserConsents(userId),
      this.getBusinessProfile(userId),
    ]);

    return {
      user: user ? { id: user.id, email: user.email, accountType: user.accountType, createdAt: user.createdAt } : null,
      events: userEvents,
      likes,
      comments,
      shares,
      consents,
      businessProfile: businessProfile || null,
    };
  }
}

export const storage = new DatabaseStorage();
