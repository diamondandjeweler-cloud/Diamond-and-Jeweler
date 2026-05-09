import { Link } from 'react-router-dom'
import { ROLES, LOCATIONS, type RoleSlug, type LocationSlug } from '../data/silo-data'

interface RelatedLinksProps {
  roles?: RoleSlug[]
  locations?: LocationSlug[]
  hires?: Array<{ slug: string; label: string }>
  blog?: Array<{ slug: string; label: string }>
}

export default function RelatedLinks({ roles, locations, hires, blog }: RelatedLinksProps) {
  return (
    <aside aria-label="Related careers and locations" className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {roles && roles.length > 0 && (
        <div className="rounded-xl ring-1 ring-[#e8edff] bg-[#fafbff] p-5">
          <h3 className="text-sm font-bold text-[#0B1220] mb-2">Related careers</h3>
          <ul className="space-y-1.5">
            {roles.map((slug) => {
              const r = ROLES[slug]
              if (!r) return null
              return (
                <li key={slug}>
                  <Link to={`/jobs/${slug}`} className="text-sm text-[#1B2A6B] hover:text-[#0B1220] underline-offset-2 hover:underline">
                    {r.name} jobs
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {locations && locations.length > 0 && (
        <div className="rounded-xl ring-1 ring-[#e8edff] bg-[#fafbff] p-5">
          <h3 className="text-sm font-bold text-[#0B1220] mb-2">Locations hiring now</h3>
          <ul className="space-y-1.5">
            {locations.map((slug) => {
              const l = LOCATIONS[slug]
              if (!l) return null
              return (
                <li key={slug}>
                  <Link to={`/jobs-in-${slug}`} className="text-sm text-[#1B2A6B] hover:text-[#0B1220] underline-offset-2 hover:underline">
                    Jobs in {l.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {hires && hires.length > 0 && (
        <div className="rounded-xl ring-1 ring-[#e8edff] bg-[#fafbff] p-5">
          <h3 className="text-sm font-bold text-[#0B1220] mb-2">For employers</h3>
          <ul className="space-y-1.5">
            {hires.map(({ slug, label }) => (
              <li key={slug}>
                <Link to={`/hire-${slug}`} className="text-sm text-[#1B2A6B] hover:text-[#0B1220] underline-offset-2 hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blog && blog.length > 0 && (
        <div className="rounded-xl ring-1 ring-[#e8edff] bg-[#fafbff] p-5">
          <h3 className="text-sm font-bold text-[#0B1220] mb-2">Career insights</h3>
          <ul className="space-y-1.5">
            {blog.map(({ slug, label }) => (
              <li key={slug}>
                <Link to={`/careers/${slug}`} className="text-sm text-[#1B2A6B] hover:text-[#0B1220] underline-offset-2 hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
