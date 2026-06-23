import { ProjectCard } from './ProjectCard'
import type { Project } from '@/stores/projectStore'

interface ProjectGridProps {
  projects: Project[]
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      role="list"
      aria-label="Your projects"
    >
      {projects.map((project) => (
        <div key={project.id} role="listitem">
          <ProjectCard project={project} />
        </div>
      ))}
    </div>
  )
}
