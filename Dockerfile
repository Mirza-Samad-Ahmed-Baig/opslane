# Use official Node.js LTS slim image (20.x is LTS until April 2026)
# This provides Node.js 20.x pre-installed with better security and smaller image size
FROM node:20.18.0-bookworm-slim

# Install only essential tools for development
# Combined into single layer for better caching and smaller image size
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user for running Claude Code
RUN useradd -m -s /bin/bash claude

# Create workspace directory with proper permissions
RUN mkdir -p /workspace/repo && chown -R claude:claude /workspace

# Switch to non-root user for security
USER claude

# Configure npm to use user-local directory for global packages
# Using ENV for better Docker layer caching and clarity
ENV NPM_CONFIG_PREFIX=/home/claude/.npm-global
ENV PATH="/home/claude/.npm-global/bin:${PATH}"

# Install Claude Code CLI with pinned version for reproducible builds
# Version 2.0.19 verified to work with our infrastructure
RUN npm install -g @anthropic-ai/claude-code@2.0.19

# Set working directory for Claude operations
WORKDIR /workspace

# Health check to verify Claude CLI is accessible and functioning
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD claude --version || exit 1

# Default command keeps container running for interactive sessions
CMD ["tail", "-f", "/dev/null"]
