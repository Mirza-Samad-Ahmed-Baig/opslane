FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential tools for development
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for running Claude Code
RUN useradd -m -s /bin/bash claude

# Create workspace directory
RUN mkdir -p /workspace/repo && chown -R claude:claude /workspace

# Switch to claude user
USER claude

# Set working directory
WORKDIR /workspace

# Keep container running (will be overridden by docker run)
CMD ["tail", "-f", "/dev/null"]
