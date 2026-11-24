import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CommentForm } from '@/components/community/comment-form';
import { CommentList } from '@/components/community/comment-list';
import { PostCard } from '@/components/community/post-card';
import { Button } from '@/components/ui/button';
import { POST_KIND_LABELS } from '@/lib/community';
import { getSession } from '@/server/auth';
import { getPost, listComments } from '@/server/community';
import { getProfileByUserId } from '@/server/profiles';

type Props = { params: Promise<{ postId: string }> };

const load = cache(async (postId: string) => {
  const session = await getSession();
  const post = await getPost(postId, session?.user.id ?? null);
  return { session, post };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { post } = await load((await params).postId);
  if (!post) return { title: 'Post not found', robots: { index: false } };
  const title = `${post.author.businessName}: ${POST_KIND_LABELS[post.kind]}`;
  const description = post.body.replace(/\s+/g, ' ').slice(0, 160);
  const image = post.photos[0]?.url ?? post.author.avatarUrl;
  return {
    title,
    description,
    alternates: { canonical: `/community/${post.id}` },
    openGraph: { title, description, type: 'article', url: `/community/${post.id}`, images: image ? [image] : undefined },
  };
}

export default async function PostPage({ params }: Props) {
  const { session, post } = await load((await params).postId);
  if (!post) notFound();
  const viewerId = session?.user.id ?? null;
  const [comments, profile] = await Promise.all([listComments(post.id), viewerId ? getProfileByUserId(viewerId) : null]);
  const canInteract = !!profile && profile.status === 'active';

  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Community
      </Link>
      <PostCard post={post} viewer={{ signedIn: canInteract, isAuthor: post.authorUserId === viewerId }} linkToPost={false} />
      <section className="grid gap-4 rounded-xl border bg-background p-4 shadow-card sm:p-5" aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="font-semibold">
          Comments
        </h2>
        <CommentList comments={comments} viewerUserId={canInteract ? viewerId : null} postAuthorUserId={post.authorUserId} />
        {canInteract ? (
          <CommentForm postId={post.id} />
        ) : session ? (
          <Button asChild variant="outline" className="justify-self-start">
            <Link href="/onboarding">Create your profile to comment</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="justify-self-start">
            <Link href={`/login?next=${encodeURIComponent(`/community/${post.id}`)}`}>Log in to comment</Link>
          </Button>
        )}
      </section>
    </div>
  );
}
