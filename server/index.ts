import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { metrics } from "./metrics";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

const app = express();
// Default to production for safety if NODE_ENV is not set
const isProduction = process.env.NODE_ENV !== "development";

import { log } from "./logger";

// Security middleware
app.disable("x-powered-by");
app.set("trust proxy", 1);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:5000",
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Security headers with helmet
if (isProduction) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' covers inline style="" attributes (Radix uses these
        // for positioning); Google Fonts' stylesheet is a separate external
        // source and needs its own allowance.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
} else {
  // Relaxed CSP for development
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
}

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // limit each IP to 100 requests per windowMs in production
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// WebSocket rate limiting (less strict)
const wsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 connection attempts per minute
  message: "Too many connection attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/ws", wsLimiter);

// Body parsing middleware
app.use(express.json({ limit: "1kb" }));
app.use(express.urlencoded({ extended: false, limit: "1kb" }));

// Health check endpoint
app.get("/health", async (_req, res) => {
  let activeRooms: string[] = [];
  let status = "healthy";

  try {
    activeRooms = await storage.listActiveRooms();
  } catch (error) {
    status = "degraded";
    log(`Health check storage error: ${(error as Error).message}`);
  }

  const snapshot = await metrics.snapshot(activeRooms.length);

  res.status(200).json({
    status,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    ...snapshot,
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "...";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Don't expose error details in production
    if (isProduction) {
      log(`Error: ${err.stack || err}`);
      res.status(status).json({ message: status === 500 ? "Internal Server Error" : message });
    } else {
      res.status(status).json({ message, stack: err.stack });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (!isProduction) {
    // Dynamic import to avoid bundling vite in production
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./static.js");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions =
    process.platform === "win32"
      ? { port, host: "0.0.0.0" }
      : { port, host: "0.0.0.0", reusePort: true };

  const serverInstance = server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handler
  const gracefulShutdown = (signal: string) => {
    log(`${signal} received, starting graceful shutdown`);
    
    serverInstance.close(() => {
      log('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      log('Forcing shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (err) => {
    log(`Uncaught Exception: ${err.message}`);
    console.error(err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    console.error(reason);
  });
})();
