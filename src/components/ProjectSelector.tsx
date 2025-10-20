import { useState, useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Project } from '@/types/project';
import { Input } from '@/components/ui/input';

interface ProjectSelectorProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onBrowse: () => void;
  isBrowsing?: boolean;
}

/**
 * ProjectSelector - Typeahead component for selecting recently opened projects
 *
 * Features:
 * - Search/filter projects by name or path
 * - Keyboard navigation (arrow keys, Enter)
 * - Click to select
 * - "Add new project" option
 */
export function ProjectSelector({
  projects,
  onSelect,
  onBrowse,
  isBrowsing,
}: ProjectSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects;
    }

    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(query) || p.local_repo_path.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isFocused || filteredProjects.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredProjects.length));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex === filteredProjects.length) {
          // "Add new project" option selected
          onBrowse();
        } else if (filteredProjects[selectedIndex]) {
          onSelect(filteredProjects[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsFocused(false);
        break;
    }
  };

  return (
    <div className="relative w-full">
      <Input
        type="text"
        placeholder="Search recently opened projects..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          // Delay to allow click events to fire
          setTimeout(() => setIsFocused(false), 200);
        }}
        onKeyDown={handleKeyDown}
        className="w-full"
      />

      {/* Dropdown */}
      {isFocused && (
        <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          {filteredProjects.length === 0 && !searchQuery ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No recent projects</div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No projects found</div>
          ) : (
            filteredProjects.map((project, index) => (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left ${
                  index === selectedIndex ? 'bg-muted/50' : ''
                }`}
              >
                <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-medium text-sm truncate">{project.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {project.local_repo_path}
                  </span>
                </div>
              </button>
            ))
          )}

          {/* Add new project option */}
          <button
            onClick={onBrowse}
            disabled={isBrowsing}
            className={`w-full px-4 py-3 border-t flex items-center gap-3 hover:bg-muted/50 transition-colors ${
              selectedIndex === filteredProjects.length ? 'bg-muted/50' : ''
            }`}
          >
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {isBrowsing ? 'Adding project...' : 'Add new project...'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
