import { Card, CardContent } from '@/components/ui/card';

/** Shared centred card used by the authentication pages. */
export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-md">
        <CardContent className="grid gap-6 p-6 sm:p-8">
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
