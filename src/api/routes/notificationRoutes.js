// src/api/routes/notificationRoutes.js
import { listNotifications, markNotificationRead } from '../../services/queries.js';

export default async function notificationRoutes(fastify) {
  // GET /notifications
  fastify.get('/', async (req) => {
    return await listNotifications(req.user, req.query);
  });

  // POST /notifications/:id/read
  fastify.post('/:id/read', async (req) => {
    return await markNotificationRead(req.user, req.params.id);
  });
}
