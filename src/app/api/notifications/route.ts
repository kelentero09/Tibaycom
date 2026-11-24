import { listNotifications } from '@/server/community';
import { route } from '@/server/http';

export const GET = route({ access: 'user', limit: { name: 'notifications', max: 120, windowSeconds: 600 } }, async ({ user }) => listNotifications(user.id));
