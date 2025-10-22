/**
 * Parses a unified diff format and extracts old and new content
 * Optimized for clarity - shows only actual changes like GitHub
 */
export function parseDiff(diff: string): { oldValue: string; newValue: string } {
  if (!diff || diff.trim().length === 0) {
    return { oldValue: '', newValue: '' };
  }

  // Check if it's a binary file message
  if (diff.startsWith('Binary file')) {
    return { oldValue: '', newValue: diff };
  }

  const lines = diff.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    // Skip all metadata headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('@@') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      continue;
    }

    // Process only actual change lines
    if (line.startsWith('+')) {
      // Addition - only show in new
      newLines.push(line.substring(1));
    } else if (line.startsWith('-')) {
      // Deletion - only show in old
      oldLines.push(line.substring(1));
    } else if (line.startsWith(' ')) {
      // Context line - show in both
      const content = line.substring(1);
      oldLines.push(content);
      newLines.push(content);
    } else if (line.trim().length > 0) {
      // Non-prefixed content (fallback for custom formats)
      oldLines.push(line);
      newLines.push(line);
    }
  }

  return {
    oldValue: oldLines.join('\n'),
    newValue: newLines.join('\n'),
  };
}

/**
 * Detects the language from file extension for syntax highlighting
 */
export function detectLanguage(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    // Programming languages
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',

    // Markup/Config
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Other
    sql: 'sql',
    graphql: 'graphql',
    dockerfile: 'docker',
    makefile: 'makefile',
  };

  return languageMap[ext] || 'text';
}
