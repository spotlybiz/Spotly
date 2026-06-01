import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, eventCategories, accountTypeLimits, insertEventReportSchema, insertTrafficIncidentSchema, incidentTypes, tags, eventTags, type Tag } from "@shared/schema";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  generateVerificationToken,
  getVerificationExpiry,
  authMiddleware,
  optionalAuthMiddleware,
  requireEmailVerified,
  type AuthenticatedRequest
} from "./auth";
import { sendVerificationEmail } from "./email";

const geocodeSchema = z.object({
  address: z.string().min(1, "Address is required"),
});

// ============================================
// SEARCH HELPER FUNCTIONS
// ============================================

// Haversine formula for calculating distance between two coordinates
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// Fuzzy match: checks if target contains a substring close to query
function fuzzyMatch(text: string, query: string, maxDistance: number): boolean {
  if (query.length < 3) return false; // Too short for fuzzy matching
  
  const words = text.split(/\s+/);
  for (const word of words) {
    if (word.length >= query.length - maxDistance && word.length <= query.length + maxDistance) {
      if (levenshteinDistance(word, query) <= maxDistance) {
        return true;
      }
    }
  }
  return false;
}

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  accountType: z.enum(["individual", "business"]).optional().default("individual"),
  businessName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts, please try again later" },
  });

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/", generalLimiter);

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, accountType, businessName } = registerSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      if (accountType === "business" && !businessName) {
        return res.status(400).json({ error: "Business name is required for business accounts" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        accountType,
      });

      if (accountType === "business" && businessName) {
        await storage.createBusinessProfile({
          userId: user.id,
          businessName,
          website: null,
          contactInfo: null,
        });
      }

      const verificationToken = generateVerificationToken();
      const verificationExpiry = getVerificationExpiry();
      await storage.createEmailVerification(user.id, verificationToken, verificationExpiry);
      
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(email, verificationToken, baseUrl);

      const token = generateToken(user);
      
      res.status(201).json({
        message: "Registration successful. Please check your email to verify your account.",
        token,
        user: {
          id: user.id,
          email: user.email,
          accountType: user.accountType,
          isEmailVerified: user.isEmailVerified,
          trustScore: user.trustScore,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = generateToken(user);
      const businessProfile = user.accountType === "business" 
        ? await storage.getBusinessProfile(user.id) 
        : null;
      
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          accountType: user.accountType,
          isEmailVerified: user.isEmailVerified,
          trustScore: user.trustScore,
          businessProfile,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Verification token required" });
      }

      const verification = await storage.getEmailVerification(token);
      if (!verification) {
        return res.status(400).json({ error: "Invalid verification token" });
      }

      if (new Date() > verification.expiresAt) {
        await storage.deleteEmailVerification(token);
        return res.status(400).json({ error: "Verification token expired" });
      }

      await storage.verifyUserEmail(verification.userId);
      await storage.deleteEmailVerification(token);
      
      const user = await storage.getUser(verification.userId);
      if (user) {
        await storage.updateUser(user.id, { trustScore: user.trustScore + 10 });
      }

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (req.user.isEmailVerified) {
        return res.status(400).json({ error: "Email already verified" });
      }

      const verificationToken = generateVerificationToken();
      const verificationExpiry = getVerificationExpiry();
      await storage.createEmailVerification(req.user.id, verificationToken, verificationExpiry);
      
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(req.user.email, verificationToken, baseUrl);

      res.json({ message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const businessProfile = req.user.accountType === "business" 
        ? await storage.getBusinessProfile(req.user.id) 
        : null;

      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          accountType: req.user.accountType,
          isEmailVerified: req.user.isEmailVerified,
          trustScore: req.user.trustScore,
          businessProfile,
        },
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const { category, search, lat, lng, radius } = req.query;
      
      let events = await storage.getAllEvents();
      
      if (category && typeof category === "string" && eventCategories.includes(category as any)) {
        events = events.filter(e => e.category === category);
      }
      
      if (search && typeof search === "string") {
        const query = search.toLowerCase();
        events = events.filter(e =>
          e.name.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.address.toLowerCase().includes(query)
        );
      }
      
      if (lat && lng && radius) {
        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const radiusMiles = parseFloat(radius as string);
        
        if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(radiusMiles)) {
          const eventIds = new Set(events.map(e => e.id));
          const nearbyEvents = await storage.getEventsNearLocation(latitude, longitude, radiusMiles);
          events = nearbyEvents.filter(e => eventIds.has(e.id));
        }
      }
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // ============================================
  // DISCOVERY SEARCH API - Production-grade fuzzy search
  // ============================================
  
  // Main search endpoint with fuzzy matching, tags, location, and multi-signal ranking
  app.get("/api/search", async (req, res) => {
    try {
      const { q, lat, lng, radius, category, limit = "20", offset = "0" } = req.query;
      const query = (q as string || "").trim().toLowerCase();
      const userLat = lat ? parseFloat(lat as string) : null;
      const userLng = lng ? parseFloat(lng as string) : null;
      const searchRadius = radius ? parseFloat(radius as string) : 50; // Default 50 miles
      const maxResults = Math.min(parseInt(limit as string) || 20, 100);
      const skipResults = parseInt(offset as string) || 0;
      
      // Step 1: Get all approved events
      let events = await storage.getAllEvents();
      events = events.filter(e => e.status === "approved");
      
      // Step 2: Get all tags for events (batch query for efficiency)
      const eventTagsMap = await storage.getTagsForEvents(events.map(e => e.id));
      
      // Step 3: Normalize and tokenize query
      const queryTokens = query
        .replace(/[#@]/g, " ")
        .split(/\s+/)
        .filter(t => t.length > 0);
      
      // Step 4: Calculate scores for each event
      const now = new Date();
      const scoredEvents = events.map(event => {
        const eventTags = eventTagsMap[event.id] || [];
        const tagNames = eventTags.map(t => t.name.toLowerCase());
        
        // ========== TEXT RELEVANCE SCORE (0-40 points) ==========
        // Matches in title are worth more than description
        let textScore = 0;
        if (query) {
          const titleLower = event.name.toLowerCase();
          const descLower = event.description.toLowerCase();
          const addressLower = event.address.toLowerCase();
          
          for (const token of queryTokens) {
            // Exact match in title (highest value)
            if (titleLower.includes(token)) {
              textScore += token.length >= 4 ? 15 : 10;
            }
            // Prefix match in title
            else if (titleLower.split(/\s+/).some(w => w.startsWith(token))) {
              textScore += 8;
            }
            // Fuzzy match in title (Levenshtein-based)
            else if (fuzzyMatch(titleLower, token, 2)) {
              textScore += 5;
            }
            
            // Match in description
            if (descLower.includes(token)) {
              textScore += 5;
            }
            
            // Match in address
            if (addressLower.includes(token)) {
              textScore += 3;
            }
          }
        }
        textScore = Math.min(textScore, 40); // Cap at 40 points
        
        // ========== TAG RELEVANCE SCORE (0-30 points) ==========
        let tagScore = 0;
        if (query && tagNames.length > 0) {
          for (const token of queryTokens) {
            for (const tagName of tagNames) {
              // Exact tag match
              if (tagName === token) {
                tagScore += 15;
              }
              // Tag contains token
              else if (tagName.includes(token)) {
                tagScore += 8;
              }
              // Token is prefix of tag
              else if (tagName.startsWith(token)) {
                tagScore += 6;
              }
              // Fuzzy tag match
              else if (fuzzyMatch(tagName, token, 1)) {
                tagScore += 3;
              }
            }
          }
        }
        tagScore = Math.min(tagScore, 30); // Cap at 30 points
        
        // ========== LOCATION SCORE (0-20 points) ==========
        // Closer events rank higher
        let locationScore = 0;
        let distanceMiles = Infinity;
        if (userLat !== null && userLng !== null) {
          distanceMiles = haversineDistance(userLat, userLng, event.latitude, event.longitude);
          
          if (distanceMiles <= 1) {
            locationScore = 20; // Within 1 mile = max score
          } else if (distanceMiles <= 5) {
            locationScore = 18;
          } else if (distanceMiles <= 10) {
            locationScore = 15;
          } else if (distanceMiles <= 25) {
            locationScore = 10;
          } else if (distanceMiles <= 50) {
            locationScore = 5;
          } else {
            locationScore = Math.max(0, 3 - Math.floor(distanceMiles / 50));
          }
        }
        
        // ========== TIME RELEVANCE SCORE (0-10 points) ==========
        // Upcoming events within 7 days rank highest
        let timeScore = 0;
        const eventStart = new Date(event.startDate);
        const eventEnd = new Date(event.endDate);
        const hoursUntilStart = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (now >= eventStart && now <= eventEnd) {
          timeScore = 10; // Happening now
        } else if (hoursUntilStart > 0 && hoursUntilStart <= 24) {
          timeScore = 9; // Within 24 hours
        } else if (hoursUntilStart > 0 && hoursUntilStart <= 72) {
          timeScore = 7; // Within 3 days
        } else if (hoursUntilStart > 0 && hoursUntilStart <= 168) {
          timeScore = 5; // Within 7 days
        } else if (hoursUntilStart > 0) {
          timeScore = 2; // Future event
        } else {
          timeScore = 0; // Past event
        }
        
        // ========== POPULARITY SCORE (0-10 points) ==========
        const viewCount = event.viewCount || 0;
        const likeCount = event.likeCount || 0;
        const shareCount = event.shareCount || 0;
        const popularityRaw = (likeCount * 3) + (shareCount * 2) + (viewCount * 0.1);
        const popularityScore = Math.min(10, Math.log10(popularityRaw + 1) * 3);
        
        // ========== CATEGORY FILTER ==========
        let categoryMatch = true;
        if (category && typeof category === "string") {
          categoryMatch = event.category === category;
        }
        
        // ========== COMBINED SCORE ==========
        // Weight: text (40%) + tags (30%) + location (20%) + time (10%)
        const totalScore = textScore + tagScore + locationScore + timeScore + popularityScore;
        
        return {
          event,
          tags: eventTags,
          textScore,
          tagScore,
          locationScore,
          timeScore,
          popularityScore,
          totalScore,
          distanceMiles,
          categoryMatch,
        };
      });
      
      // Step 5: Filter and sort results
      let results = scoredEvents
        .filter(r => r.categoryMatch)
        .filter(r => {
          // If no query, return all matching category (optionally filter by radius)
          if (!query) {
            return userLat === null || r.distanceMiles <= searchRadius;
          }
          // If query exists, require minimum relevance OR be nearby
          return r.textScore > 0 || r.tagScore > 0 || r.distanceMiles <= searchRadius;
        });
      
      // Sort by total score descending
      results.sort((a, b) => b.totalScore - a.totalScore);
      
      // Step 6: Handle empty/broad search
      if (results.length === 0 && !query) {
        // Show trending nearby events
        results = scoredEvents
          .filter(r => r.categoryMatch)
          .sort((a, b) => {
            // Sort by location first, then popularity
            if (userLat !== null) {
              const distDiff = a.distanceMiles - b.distanceMiles;
              if (Math.abs(distDiff) > 5) return distDiff;
            }
            return b.popularityScore - a.popularityScore;
          });
      }
      
      // Step 7: Paginate
      const total = results.length;
      const paginatedResults = results.slice(skipResults, skipResults + maxResults);
      
      // Step 8: Format response
      const response = {
        query,
        total,
        offset: skipResults,
        limit: maxResults,
        results: paginatedResults.map(r => ({
          ...r.event,
          tags: r.tags.map(t => t.name),
          distance: r.distanceMiles === Infinity ? null : Math.round(r.distanceMiles * 10) / 10,
          relevanceScore: Math.round(r.totalScore),
        })),
      };
      
      res.json(response);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });
  
  // Autocomplete endpoint - fast suggestions while typing
  app.get("/api/search/autocomplete", async (req, res) => {
    try {
      const { q, lat, lng } = req.query;
      const query = (q as string || "").trim().toLowerCase();
      const userLat = lat ? parseFloat(lat as string) : null;
      const userLng = lng ? parseFloat(lng as string) : null;
      
      const events = await storage.getAllEvents();
      const approvedEvents = events.filter(e => e.status === "approved" && new Date(e.endDate) >= new Date());
      
      const fuzzyMatch = (text: string, query: string): number => {
        const lowerText = text.toLowerCase();
        if (lowerText === query) return 1.0;
        if (lowerText.startsWith(query)) return 0.9;
        if (lowerText.includes(query)) return 0.7;
        const words = lowerText.split(/\s+/);
        for (const word of words) {
          if (word.startsWith(query)) return 0.6;
        }
        let matches = 0;
        let queryIdx = 0;
        for (let i = 0; i < lowerText.length && queryIdx < query.length; i++) {
          if (lowerText[i] === query[queryIdx]) {
            matches++;
            queryIdx++;
          }
        }
        if (queryIdx === query.length && matches >= query.length * 0.8) return 0.3;
        return 0;
      };
      
      const calculateScore = (event: typeof approvedEvents[0]): { score: number; textMatch: number } => {
        let score = 0;
        let textMatch = 0;
        
        if (query) {
          const nameMatch = fuzzyMatch(event.name, query);
          const descMatch = fuzzyMatch(event.description, query);
          const addressMatch = fuzzyMatch(event.address, query);
          const categoryMatch = fuzzyMatch(event.category.replace(/_/g, " "), query);
          
          textMatch = Math.max(nameMatch, descMatch, addressMatch, categoryMatch);
          
          score += nameMatch * 40;
          score += descMatch * 15;
          score += addressMatch * 10;
          score += categoryMatch * 20;
        }
        
        if (userLat && userLng) {
          const dist = haversineDistance(userLat, userLng, event.latitude, event.longitude);
          if (dist < 1) score += 25;
          else if (dist < 5) score += 20;
          else if (dist < 10) score += 15;
          else if (dist < 25) score += 10;
          else if (dist < 50) score += 5;
        }
        
        const now = new Date();
        const start = new Date(event.startDate);
        const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntil <= 0 && new Date(event.endDate) > now) score += 20;
        else if (hoursUntil > 0 && hoursUntil <= 24) score += 15;
        else if (hoursUntil > 0 && hoursUntil <= 72) score += 10;
        else if (hoursUntil > 0 && hoursUntil <= 168) score += 5;
        
        score += Math.min((event.likeCount || 0) * 0.5, 10);
        score += Math.min((event.viewCount || 0) * 0.1, 5);
        
        return { score, textMatch };
      };
      
      if (query.length < 2) {
        const trendingEvents = approvedEvents
          .map(e => ({ event: e, ...calculateScore(e) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(({ event }) => ({ 
            id: event.id, 
            name: event.name, 
            category: event.category,
            latitude: event.latitude,
            longitude: event.longitude,
            address: event.address,
            startDate: event.startDate,
            endDate: event.endDate,
            description: event.description,
          }));
        
        return res.json({
          tags: [],
          events: trendingEvents,
          categories: [],
        });
      }
      
      const scoredEvents = approvedEvents
        .map(e => ({ event: e, ...calculateScore(e) }))
        .filter(({ textMatch }) => textMatch > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 7);
      
      const allTags = await storage.getAllTags();
      const matchingTags = allTags
        .filter(t => t.name.includes(query) || query.includes(t.name))
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5);
      
      const matchingCategories = eventCategories.filter(c => 
        c.toLowerCase().includes(query) || query.includes(c.toLowerCase())
      );
      
      res.json({
        tags: matchingTags.map(t => ({ name: t.name, count: t.usageCount })),
        events: scoredEvents.map(({ event }) => ({ 
          id: event.id, 
          name: event.name, 
          category: event.category,
          latitude: event.latitude,
          longitude: event.longitude,
          address: event.address,
          startDate: event.startDate,
          endDate: event.endDate,
          description: event.description,
        })),
        categories: matchingCategories,
      });
    } catch (error) {
      console.error("Autocomplete error:", error);
      res.status(500).json({ error: "Autocomplete failed" });
    }
  });
  
  // ============================================
  // TAG MANAGEMENT API
  // ============================================
  
  // Get popular tags
  app.get("/api/tags/popular", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const tags = await storage.getPopularTags(limit);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching popular tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  
  // Search/suggest tags
  app.get("/api/tags/suggest", async (req, res) => {
    try {
      const query = (req.query.q as string || "").trim().toLowerCase();
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (query.length < 1) {
        const popularTags = await storage.getPopularTags(limit);
        return res.json(popularTags);
      }
      
      const allTags = await storage.getAllTags();
      const matching = allTags
        .filter(t => t.name.includes(query) || t.name.startsWith(query))
        .sort((a, b) => {
          // Prioritize exact prefix matches
          const aPrefix = a.name.startsWith(query) ? 1 : 0;
          const bPrefix = b.name.startsWith(query) ? 1 : 0;
          if (aPrefix !== bPrefix) return bPrefix - aPrefix;
          return b.usageCount - a.usageCount;
        })
        .slice(0, limit);
      
      res.json(matching);
    } catch (error) {
      console.error("Error suggesting tags:", error);
      res.status(500).json({ error: "Failed to suggest tags" });
    }
  });
  
  // Get tags for a specific event
  app.get("/api/events/:id/tags", async (req, res) => {
    try {
      const { id } = req.params;
      const tags = await storage.getEventTags(id);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching event tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Set tags for an event (replaces existing tags)
  app.post("/api/events/:id/tags", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { tags: tagNames } = req.body;
      
      if (!Array.isArray(tagNames)) {
        return res.status(400).json({ error: "Tags must be an array" });
      }
      
      const event = await storage.getEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const addedTags = await storage.setEventTags(id, tagNames);
      res.json(addedTags);
    } catch (error) {
      console.error("Error setting event tags:", error);
      res.status(500).json({ error: "Failed to set tags" });
    }
  });

  // Get events with engagement data (MUST be before /api/events/:id to avoid :id matching "engagement")
  app.get("/api/events/engagement", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const events = await storage.getEventsWithEngagement(req.user?.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events with engagement:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.get("/api/my-events", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const events = await storage.getEventsByUser(req.user.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching user events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/my-stats", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const stats = await storage.getUserStats(req.user.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  app.get("/api/users/:userId/profile", async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await storage.getPublicUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "User not found" });
      }
      const events = await storage.getEventsByUser(userId);
      res.json({ ...profile, events });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  app.post("/api/events", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      
      if (req.user) {
        if (!req.user.isEmailVerified) {
          return res.status(403).json({ error: "Please verify your email before creating events" });
        }

        const userEvents = await storage.getEventsByUser(req.user.id);
        const activeEvents = userEvents.filter(e => new Date(e.endDate) >= new Date());
        const limits = accountTypeLimits[req.user.accountType];
        
        if (activeEvents.length >= limits.maxActiveEvents) {
          return res.status(403).json({ 
            error: `You have reached the maximum of ${limits.maxActiveEvents} active events for your account type` 
          });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventsToday = userEvents.filter(e => {
          const createdAt = new Date(e.createdAt!);
          createdAt.setHours(0, 0, 0, 0);
          return createdAt.getTime() === today.getTime();
        });
        
        if (eventsToday.length >= limits.eventsPerDay) {
          return res.status(429).json({ 
            error: `Daily limit reached. You can create ${limits.eventsPerDay} event(s) per day` 
          });
        }

        const eventWithUser = { ...validatedData, userId: req.user.id };
        const event = await storage.createEvent(eventWithUser);
        
        await storage.updateUser(req.user.id, {
          eventsCreatedToday: eventsToday.length + 1,
          lastEventCreatedAt: new Date(),
        });
        
        res.status(201).json(event);
      } else {
        const event = await storage.createEvent(validatedData);
        res.status(201).json(event);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.userId !== req.user.id) {
        return res.status(403).json({ error: "You can only edit your own events" });
      }

      const partialSchema = insertEventSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      const updatedEvent = await storage.updateEvent(req.params.id, validatedData);
      res.json(updatedEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.userId !== req.user.id) {
        return res.status(403).json({ error: "You can only delete your own events" });
      }

      await storage.deleteEvent(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  app.post("/api/events/:id/report", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const reportData = insertEventReportSchema.parse({
        ...req.body,
        eventId: req.params.id,
        reporterId: req.user?.id || null,
      });

      const report = await storage.createEventReport(reportData);

      if (event.userId) {
        const eventOwner = await storage.getUser(event.userId);
        if (eventOwner) {
          await storage.updateUser(event.userId, {
            trustScore: Math.max(0, eventOwner.trustScore - 5),
          });
        }
      }

      res.status(201).json({ message: "Report submitted successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error creating report:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // ============================================
  // COMMUNITY ENGAGEMENT ROUTES
  // ============================================

  // Get engagement data for a specific event
  app.get("/api/events/:id/engagement", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const engagement = await storage.getEventEngagement(req.params.id, req.user?.id);
      res.json(engagement);
    } catch (error) {
      console.error("Error fetching event engagement:", error);
      res.status(500).json({ error: "Failed to fetch engagement data" });
    }
  });

  // Like an event
  app.post("/api/events/:id/like", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const like = await storage.likeEvent(req.params.id, req.user!.id);
      const likeCount = await storage.getEventLikeCount(req.params.id);
      res.json({ liked: true, likeCount });
    } catch (error) {
      console.error("Error liking event:", error);
      res.status(500).json({ error: "Failed to like event" });
    }
  });

  // Unlike an event
  app.delete("/api/events/:id/like", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      await storage.unlikeEvent(req.params.id, req.user!.id);
      const likeCount = await storage.getEventLikeCount(req.params.id);
      res.json({ liked: false, likeCount });
    } catch (error) {
      console.error("Error unliking event:", error);
      res.status(500).json({ error: "Failed to unlike event" });
    }
  });

  // Get comments for an event
  app.get("/api/events/:id/comments", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const comments = await storage.getEventComments(req.params.id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Add a comment to an event
  app.post("/api/events/:id/comments", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: "Comment too long (max 500 characters)" });
      }

      const comment = await storage.createComment({
        eventId: req.params.id,
        userId: req.user!.id,
        content: content.trim(),
      });

      const commentCount = await storage.getEventCommentCount(req.params.id);
      res.status(201).json({ comment, commentCount });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Delete a comment (only by the author)
  app.delete("/api/events/:eventId/comments/:commentId", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deleteComment(req.params.commentId, req.user!.id);
      if (!deleted) {
        return res.status(404).json({ error: "Comment not found or you don't have permission to delete it" });
      }

      const commentCount = await storage.getEventCommentCount(req.params.eventId);
      res.json({ deleted: true, commentCount });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Record a share
  app.post("/api/events/:id/share", optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { shareType = 'copy_link' } = req.body;
      await storage.recordShare(req.params.id, req.user?.id || null, shareType);
      const shareCount = await storage.getEventShareCount(req.params.id);
      res.json({ shared: true, shareCount });
    } catch (error) {
      console.error("Error recording share:", error);
      res.status(500).json({ error: "Failed to record share" });
    }
  });

  // ============================================
  // PUBLIC CONFIG (exposes Mapbox public token to frontend)
  // ============================================
  app.get("/api/config", (_req, res) => {
    res.json({ mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || "" });
  });

  // ============================================
  // GEOCODING (Mapbox Geocoding API v5)
  // ============================================
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = geocodeSchema.parse(req.body);
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`;
      const response = await fetch(url);

      if (!response.ok) throw new Error("Mapbox geocoding unavailable");

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return res.status(404).json({ error: "Location not found", latitude: null, longitude: null });
      }

      const feature = data.features[0];
      res.json({
        latitude: feature.center[1],
        longitude: feature.center[0],
        displayName: feature.place_name,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("Geocoding error:", error);
      res.status(500).json({ error: "Geocoding failed" });
    }
  });

  // Address autocomplete using Mapbox Geocoding API
  app.get("/api/address-autocomplete", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) return res.json({ suggestions: [] });

      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

      const lat = req.query.lat as string | undefined;
      const lng = req.query.lng as string | undefined;
      const proximity = lat && lng ? `&proximity=${lng},${lat}` : "";
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=8&types=address,poi,place,neighborhood,locality${proximity}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error("Mapbox geocoding unavailable");

      const data = await response.json();
      const suggestions = (data.features || []).map((feature: any) => ({
        displayName: feature.place_name,
        latitude: feature.center[1],
        longitude: feature.center[0],
        type: feature.place_type?.[0] || "place",
        importance: feature.relevance || 0,
      }));

      res.json({ suggestions });
    } catch (error) {
      console.error("Address autocomplete error:", error);
      res.status(500).json({ error: "Autocomplete failed", suggestions: [] });
    }
  });

  // Reverse geocoding: coordinates → address (Mapbox Geocoding API)
  app.get("/api/reverse-geocode", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid coordinates" });

      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,poi&access_token=${token}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Mapbox reverse geocoding failed");

      const data = await response.json();
      const feature = data.features?.[0];
      res.json({
        address: feature ? feature.place_name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      });
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: "Reverse geocoding failed" });
    }
  });

  // Static map image proxy (Mapbox Static Images API)
  app.get("/api/static-map", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const zoom = parseInt((req.query.zoom as string) || "14", 10);
      const width = parseInt((req.query.width as string) || "400", 10);
      const height = parseInt((req.query.height as string) || "200", 10);
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid coordinates" });

      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

      const marker = `pin-s+16a34a(${lng},${lat})`;
      const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${encodeURIComponent(marker)}/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${token}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Mapbox static map unavailable");

      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=3600");
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Static map error:", error);
      res.status(500).json({ error: "Static map failed" });
    }
  });

  // ============================================
  // ROUTING (Mapbox Directions API v5)
  // ============================================
  const routeSchema = z.object({
    startLat: z.number(),
    startLng: z.number(),
    endLat: z.number(),
    endLng: z.number(),
  });

  app.post("/api/route", async (req, res) => {
    try {
      const { startLat, startLng, endLat, endLng } = routeSchema.parse(req.body);
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

      // Mapbox Directions API - driving profile with traffic
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&steps=true&overview=full&access_token=${token}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Mapbox Directions API unavailable");

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) {
        return res.status(404).json({ error: "No route found" });
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      // Mapbox provides pre-formatted instruction strings directly
      const steps = leg.steps.map((step: any) => ({
        instruction: step.maneuver.instruction ||
          (step.maneuver.type === 'depart'
            ? `Head ${step.maneuver.modifier || 'straight'} on ${step.name || 'the road'}`
            : step.maneuver.type === 'arrive'
            ? 'Arrive at destination'
            : `${formatManeuver(step.maneuver.type, step.maneuver.modifier)} onto ${step.name || 'the road'}`),
        distance: step.distance,
        duration: step.duration,
        maneuver: step.maneuver.type,
        modifier: step.maneuver.modifier,
        coordinates: step.geometry?.coordinates || [],
      }));

      res.json({
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry.coordinates, // [[lng, lat], ...]
        steps,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("Routing error:", error);
      res.status(500).json({ error: "Routing failed" });
    }
  });

  // ============================================
  // TRAFFIC & NAVIGATION APIs
  // ============================================

  // Get active traffic incidents within bounds
  app.get("/api/traffic/incidents", async (req, res) => {
    try {
      const { north, south, east, west } = req.query;
      
      let bounds: { north: number; south: number; east: number; west: number } | undefined;
      if (north && south && east && west) {
        bounds = {
          north: parseFloat(north as string),
          south: parseFloat(south as string),
          east: parseFloat(east as string),
          west: parseFloat(west as string)
        };
      }
      
      // Cleanup expired incidents first
      await storage.cleanupExpiredIncidents();
      
      const incidents = await storage.getTrafficIncidents(bounds);
      res.json(incidents);
    } catch (error) {
      console.error("Error fetching incidents:", error);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  // Report a new traffic incident
  const reportIncidentSchema = z.object({
    type: z.enum(incidentTypes),
    latitude: z.number(),
    longitude: z.number(),
    description: z.string().optional(),
  });

  app.post("/api/traffic/incidents", optionalAuthMiddleware, async (req, res) => {
    try {
      const data = reportIncidentSchema.parse(req.body);
      const authReq = req as AuthenticatedRequest;
      
      // Default expiration: 2 hours from now
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      
      const incident = await storage.createTrafficIncident({
        ...data,
        reporterId: authReq.user?.id || null,
        expiresAt
      });
      
      res.status(201).json(incident);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error reporting incident:", error);
      res.status(500).json({ error: "Failed to report incident" });
    }
  });

  // Confirm an incident (increases confidence)
  app.post("/api/traffic/incidents/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;
      const incident = await storage.confirmTrafficIncident(id);
      
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }
      
      res.json(incident);
    } catch (error) {
      console.error("Error confirming incident:", error);
      res.status(500).json({ error: "Failed to confirm incident" });
    }
  });

  // Dismiss an incident
  app.post("/api/traffic/incidents/:id/dismiss", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.dismissTrafficIncident(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing incident:", error);
      res.status(500).json({ error: "Failed to dismiss incident" });
    }
  });

  // Get road features (stop signs, traffic lights) - POST for route-aware filtering
  const routeFeaturesSchema = z.object({
    bounds: z.object({
      north: z.number(),
      south: z.number(),
      east: z.number(),
      west: z.number(),
    }),
    routeNodeIds: z.array(z.number()).optional(), // OSM node IDs from route for topological filtering
  });

  app.post("/api/traffic/features", async (req, res) => {
    try {
      const { bounds, routeNodeIds } = routeFeaturesSchema.parse(req.body);
      
      const features = await storage.getRoadFeaturesForRoute(bounds, routeNodeIds || []);
      res.json(features);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("Error fetching road features:", error);
      res.status(500).json({ error: "Failed to fetch road features" });
    }
  });

  // Legacy GET endpoint for backwards compatibility
  app.get("/api/traffic/features", async (req, res) => {
    try {
      const { north, south, east, west } = req.query;
      
      if (!north || !south || !east || !west) {
        return res.status(400).json({ error: "Bounds required (north, south, east, west)" });
      }
      
      const bounds = {
        north: parseFloat(north as string),
        south: parseFloat(south as string),
        east: parseFloat(east as string),
        west: parseFloat(west as string)
      };
      
      const features = await storage.getRoadFeatures(bounds);
      res.json(features);
    } catch (error) {
      console.error("Error fetching road features:", error);
      res.status(500).json({ error: "Failed to fetch road features" });
    }
  });

  // Get traffic segments with speed data
  app.get("/api/traffic/segments", async (req, res) => {
    try {
      const { north, south, east, west } = req.query;
      
      if (!north || !south || !east || !west) {
        return res.status(400).json({ error: "Bounds required (north, south, east, west)" });
      }
      
      const bounds = {
        north: parseFloat(north as string),
        south: parseFloat(south as string),
        east: parseFloat(east as string),
        west: parseFloat(west as string)
      };
      
      const segments = await storage.getRoadSegments(bounds);
      res.json(segments);
    } catch (error) {
      console.error("Error fetching traffic segments:", error);
      res.status(500).json({ error: "Failed to fetch traffic segments" });
    }
  });

  // Submit anonymous speed data for traffic estimation
  const speedDataSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number().min(0).max(200), // km/h, reasonable bounds
    heading: z.number().min(0).max(360).optional(),
    sessionHash: z.string().optional(), // Anonymous session ID
  });

  app.post("/api/traffic/speed", async (req, res) => {
    try {
      const data = speedDataSchema.parse(req.body);
      await storage.submitSpeedData(data);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error submitting speed data:", error);
      res.status(500).json({ error: "Failed to submit speed data" });
    }
  });

  // ============================================
  // DEVICE TOKEN MANAGEMENT
  // ============================================

  const deviceTokenSchema = z.object({
    token: z.string().min(1, "Token is required"),
    platform: z.enum(["ios", "android", "web"]),
  });

  const deleteDeviceTokenSchema = z.object({
    token: z.string().min(1, "Token is required"),
  });

  app.post("/api/device-tokens", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { token, platform } = deviceTokenSchema.parse(req.body);
      const deviceToken = await storage.saveDeviceToken(req.user.id, token, platform);
      res.status(201).json(deviceToken);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error saving device token:", error);
      res.status(500).json({ error: "Failed to save device token" });
    }
  });

  app.delete("/api/device-tokens", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { token } = deleteDeviceTokenSchema.parse(req.body);
      const deleted = await storage.deleteDeviceToken(token);
      if (!deleted) {
        return res.status(404).json({ error: "Device token not found" });
      }
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error deleting device token:", error);
      res.status(500).json({ error: "Failed to delete device token" });
    }
  });

  // ============================================
  // PRIVACY & CONSENT
  // ============================================

  const consentSchema = z.object({
    consentType: z.string().min(1, "Consent type is required"),
  });

  app.post("/api/consent", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { consentType } = consentSchema.parse(req.body);
      const ipAddress = req.ip || "unknown";
      const userAgent = req.get("user-agent") || "unknown";
      const consent = await storage.recordConsent({
        userId: req.user.id,
        consentType: consentType as any,
        ipAddress,
        userAgent,
      });
      res.status(201).json(consent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error recording consent:", error);
      res.status(500).json({ error: "Failed to record consent" });
    }
  });

  app.get("/api/consent", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const consents = await storage.getUserConsents(req.user.id);
      res.json(consents);
    } catch (error) {
      console.error("Error fetching consents:", error);
      res.status(500).json({ error: "Failed to fetch consents" });
    }
  });

  app.post("/api/consent/revoke", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { consentType } = consentSchema.parse(req.body);
      await storage.revokeConsent(req.user.id, consentType);
      res.json({ success: true, message: "Consent revoked" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error revoking consent:", error);
      res.status(500).json({ error: "Failed to revoke consent" });
    }
  });

  // ============================================
  // DATA EXPORT
  // ============================================

  app.get("/api/user/export", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const data = await storage.exportUserData(req.user.id);
      res.json(data);
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({ error: "Failed to export user data" });
    }
  });

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  const deleteRequestSchema = z.object({
    reason: z.string().optional(),
  });

  const deleteConfirmSchema = z.object({
    verificationToken: z.string().min(1, "Verification token is required"),
  });

  app.post("/api/user/delete-request", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { reason } = deleteRequestSchema.parse(req.body);
      const confirmDeletion = req.body.confirmDeletion === true;
      
      const request = await storage.createDeletionRequest(req.user.id, reason);
      
      if (confirmDeletion) {
        await storage.processDeletion(req.user.id);
        return res.json({ success: true, message: "Account and all data permanently deleted" });
      }
      
      res.status(201).json({ 
        id: request.id,
        status: request.status,
        message: "Deletion request created. Confirm via /api/user/delete-confirm to finalize."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error creating deletion request:", error);
      res.status(500).json({ error: "Failed to create deletion request" });
    }
  });

  app.post("/api/user/delete-confirm", authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { verificationToken } = deleteConfirmSchema.parse(req.body);
      const deletionRequest = await storage.getDeletionRequest(req.user.id);
      if (!deletionRequest) {
        return res.status(404).json({ error: "No deletion request found" });
      }
      const isValid = await storage.verifyDeletionRequest(deletionRequest.id, verificationToken);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      await storage.processDeletion(req.user.id);
      res.json({ success: true, message: "Account deleted" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error confirming account deletion:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ============================================
  // PRIVACY POLICY & TERMS (STATIC)
  // ============================================

  app.get("/api/legal/privacy", (_req, res) => {
    res.json({
      title: "Privacy Policy",
      lastUpdated: "2026-02-01",
      content: `Spotly Privacy Policy

1. Introduction
Spotly ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our local event discovery application.

2. Information We Collect
We collect information you provide directly to us, including:
- Account information (email address, password hash, account type)
- Event data you create (event name, description, location, dates)
- Device tokens for push notifications
- Usage data and interaction history (likes, comments, shares)
- Location data when you use map and navigation features
- IP address and browser/device information for security purposes

3. How We Use Your Information
We use the information we collect to:
- Provide, maintain, and improve our services
- Send push notifications about events near you
- Personalize your experience and show relevant local events
- Detect, prevent, and address fraud, abuse, and security issues
- Communicate with you about updates, promotions, and support
- Comply with legal obligations

4. Information Sharing
We do not sell your personal information. We may share your information with:
- Other users (public profile, events you create, comments)
- Service providers who assist in operating our platform
- Law enforcement when required by law
- Business partners with your explicit consent

5. Data Retention
We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time.

6. Your Rights
You have the right to:
- Access your personal data (via data export)
- Correct inaccurate data
- Delete your account and data
- Withdraw consent for data processing
- Object to certain data processing activities

7. Location Data
Spotly uses your location to show nearby events and provide navigation. Location data is processed in real-time and is not permanently stored on our servers beyond what is necessary for service operation.

8. Security
We implement industry-standard security measures including encryption, secure authentication, and regular security audits to protect your information.

9. Children's Privacy
Spotly is not intended for children under 13. We do not knowingly collect personal information from children under 13.

10. Changes to This Policy
We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.

11. Contact Us
If you have questions about this Privacy Policy, please contact us through the app's support feature.`,
    });
  });

  app.get("/api/legal/terms", (_req, res) => {
    res.json({
      title: "Terms of Service",
      lastUpdated: "2026-02-01",
      content: `Spotly Terms of Service

1. Acceptance of Terms
By accessing or using Spotly, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.

2. Description of Service
Spotly is a local event discovery platform that allows users to discover, create, and share events happening in their community. The service includes event listing, map-based discovery, navigation, community engagement features, and push notifications.

3. User Accounts
- You must provide accurate and complete information when creating an account.
- You are responsible for maintaining the security of your account credentials.
- You must be at least 13 years old to create an account.
- Individual accounts may create up to 3 events per day and maintain up to 15 active events.
- Business accounts may create up to 10 events per day and maintain up to 50 active events.

4. User Content
- You retain ownership of content you create on Spotly.
- By posting content, you grant Spotly a non-exclusive, worldwide license to use, display, and distribute your content within the platform.
- You are solely responsible for the accuracy and legality of content you post.
- Events must represent real, legitimate gatherings or activities.
- We reserve the right to remove content that violates these terms.

5. Prohibited Conduct
You agree not to:
- Post false, misleading, or fraudulent event information
- Spam or create duplicate events
- Harass, threaten, or abuse other users
- Attempt to circumvent account limits or security measures
- Use the service for illegal activities
- Scrape or collect data from the platform without authorization
- Impersonate other users or organizations

6. Community Guidelines
- Treat other users with respect in comments and interactions.
- Report events that violate our guidelines using the in-app reporting feature.
- Events with multiple reports may be reviewed and removed.
- Users with low trust scores may face account restrictions.

7. Intellectual Property
The Spotly platform, including its design, features, and branding, is owned by us and protected by intellectual property laws. You may not copy, modify, or distribute our platform without permission.

8. Disclaimers
- Spotly is provided "as is" without warranties of any kind.
- We do not guarantee the accuracy of event information posted by users.
- We are not responsible for events, interactions, or transactions between users.
- Navigation and map features are provided for convenience and should not replace proper navigation judgment.

9. Limitation of Liability
To the maximum extent permitted by law, Spotly shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.

10. Account Termination
We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time through the app settings.

11. Privacy
Your use of Spotly is also governed by our Privacy Policy, which describes how we collect, use, and protect your information.

12. Changes to Terms
We may modify these Terms of Service at any time. Continued use of the service after changes constitutes acceptance of the new terms.

13. Governing Law
These terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.

14. Contact
For questions about these Terms of Service, please contact us through the app's support feature.`,
    });
  });

  // Seed road features on startup
  await storage.seedRoadFeatures();

  return httpServer;
}

// Helper to format maneuver instructions
function formatManeuver(type: string, modifier?: string): string {
  const modifierText = modifier ? modifier.replace(/-/g, ' ') : '';
  switch (type) {
    case 'turn':
      return `Turn ${modifierText}`;
    case 'merge':
      return `Merge ${modifierText}`;
    case 'fork':
      return `Take the ${modifierText} fork`;
    case 'off ramp':
      return `Take the exit ${modifierText}`;
    case 'on ramp':
      return `Take the ramp ${modifierText}`;
    case 'roundabout':
      return `Enter roundabout and exit ${modifierText}`;
    case 'rotary':
      return `Enter rotary and exit ${modifierText}`;
    case 'continue':
      return `Continue ${modifierText}`;
    case 'new name':
      return `Continue`;
    case 'end of road':
      return `At end of road, turn ${modifierText}`;
    default:
      return modifierText ? `Go ${modifierText}` : 'Continue';
  }
}
