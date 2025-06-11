# --- Stage 1: Builder for Dependencies and Application Build ---
FROM node:18-alpine AS build

# Set environment variables for safer npm operations
ENV NPM_CONFIG_LOGLEVEL warn \
    NPM_CONFIG_UPDATE_NOTIFIER false \
    NPM_CONFIG_FUND false

# Set the working directory
WORKDIR /app

# Copy package.json and lock files first to leverage Docker cache
# Use `npm ci` for clean and reproducible builds based on package-lock.json
COPY package.json yarn.lock* package-lock.json* ./

RUN npm ci --omit=dev # Installs production dependencies and skips dev dependencies for this stage

# Copy the rest of your application code
COPY . .

# Build the NestJS application
# Use tsconfig.build.json if you have one to exclude test files etc.
RUN npm run build

# --- Stage 2: Production Runtime ---
# Use a lean, production-ready base image (e.g., node:18-alpine)
FROM node:18-alpine AS production

# Security Best Practice: Create a non-root user and switch to it
# This prevents potential privilege escalation if the container is compromised
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

# Set the working directory for the non-root user
WORKDIR /app

# Copy only the necessary production files from the build stage
# This dramatically reduces the final image size and attack surface
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/package.json ./package.json # Needed for `npm start` script

# Expose the port your NestJS app listens on
EXPOSE 3000

# Healthcheck (Optional but recommended for production)
# This helps orchestrators like Kubernetes or Docker Compose know if your app is truly ready
# Customize the URL if you have a specific health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --timeout=5 -O /dev/null http://localhost:3000/health || exit 1


# Command to run your application in production
# Use `npm run start:prod` if you have it configured in package.json, otherwise `node dist/main`
CMD ["node", "dist/main"]
