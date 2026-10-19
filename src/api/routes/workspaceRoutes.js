// src/api/routes/workspaceRoutes.js
import {
  getUserWorkspaces,
  createWorkspace,
  createInvitation,
  getInvitationByCode,
  acceptInvitation
} from '../../services/workspaceService.js';
import { validationError } from '../../shared/errors.js';

export default async function workspaceRoutes(fastify) {
  // GET /workspaces - List workspaces user belongs to
  fastify.get('/', async (req) => {
    const workspaces = await getUserWorkspaces(req.user.id);
    return { workspaces };
  });

  // POST /workspaces - Create a new isolated workspace with team
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80 },
          initial_team_name: { type: 'string', maxLength: 80 },
          initial_team_key: { type: 'string', maxLength: 6 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { name, initial_team_name, initial_team_key } = req.body;
    const result = await createWorkspace(req.user.id, {
      name,
      initialTeamName: initial_team_name,
      initialTeamKey: initial_team_key
    });
    reply.status(201);
    return result;
  });

  // POST /workspaces/:id/invitations - Generate an invitation code (Lead/Owner only)
  fastify.post('/:id/invitations', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['lead', 'member', 'viewer'] },
          team_id: { type: ['string', 'integer'] },
          email: { type: 'string', format: 'email' }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const workspaceId = req.params.id;
    const { role = 'member', team_id = null, email = null } = req.body || {};
    const invitation = await createInvitation(req.user.id, workspaceId, { role, teamId: team_id, email });
    reply.status(201);
    return { ...invitation, invitation };
  });

  // GET /workspaces/invitations/:code - Verify an invitation code
  fastify.get('/invitations/:code', async (req) => {
    const invitation = await getInvitationByCode(req.params.code);
    return {
      invitation: {
        code: invitation.code,
        role: invitation.role,
        workspace_id: invitation.workspace_id,
        workspace_name: invitation.workspace_name,
        team_name: invitation.team_name,
        inviter_name: invitation.inviter_name,
        expires_at: invitation.expires_at
      }
    };
  });

  // POST /workspaces/join - Redeem invitation code to join workspace
  fastify.post('/join', {
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 4 }
        },
        additionalProperties: false
      }
    }
  }, async (req) => {
    const { code } = req.body;
    return await acceptInvitation(req.user.id, code);
  });
}
