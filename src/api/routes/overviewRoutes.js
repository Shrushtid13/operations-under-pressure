// src/api/routes/overviewRoutes.js
import { getOverviewSummary } from '../../services/queries.js';

export default async function overviewRoutes(fastify) {
  // GET /overview/summary
  fastify.get('/summary', async (req) => {
    return await getOverviewSummary(req.user);
  });
}
