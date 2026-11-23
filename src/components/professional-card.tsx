import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { professionLabel } from '@/lib/professions';
import type { DirectoryCard } from '@/server/profiles';
import { imageUrl } from '@/server/storage';
import { Badge } from './ui/misc';

export function ProfessionalCard({ pro }: { pro: DirectoryCard }) {
  const image = imageUrl(pro.avatarKey ?? pro.logoKey);
  return (
    <Link href={`/p/${pro.username}`} className="card-interactive flex h-full gap-4 rounded-xl border bg-background p-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" loading="lazy" decoding="async" data-fade className="size-full object-cover" /> : pro.businessName[0]?.toUpperCase()}
      </div>
      <div className="grid min-w-0 content-start gap-1.5">
        <h3 className="truncate font-semibold">{pro.businessName}</h3>
        <div className="flex flex-wrap gap-1.5">
          {pro.professions.slice(0, 2).map((slug) => (
            <Badge key={slug} variant="accent">
              {professionLabel(slug)}
            </Badge>
          ))}
          {pro.professions.length > 2 && <Badge variant="outline">+{pro.professions.length - 2}</Badge>}
        </div>
        <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{[pro.city, pro.province].filter(Boolean).join(', ') || 'Philippines'}</span>
        </p>
        {pro.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{pro.bio}</p>}
      </div>
    </Link>
  );
}
