import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface PageHeaderProps {
  // Trail above the title, e.g. Admin > Roles. The last entry is the current
  // page and renders as plain text; earlier ones link.
  breadcrumb: { label: string; href?: string }[];
  title: string;
  description?: string;
}

export function PageHeader({ breadcrumb, title, description }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {breadcrumb.map((crumb, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
                )}
                {!isLast && <ChevronRight className="size-3.5" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </nav>

      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-muted-foreground">{description}</p>}
    </div>
  );
}
