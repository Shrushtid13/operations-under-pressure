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

  // POST /notifications/check-deadlines - Trigger deadline evaluation on-demand
  fastify.post('/check-deadlines', async () => {
    const { pool } = await import('../../db/pool.js');
    const { processDeadlineReminders } = await import('../../services/reminderService.js');
    return await processDeadlineReminders(pool);
  });
}
