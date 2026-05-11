import { WorkspacesRepository } from "./workspaces.repository";
import { UsersRepository } from "../users/users.repository";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import {
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_WALLET_GROUPS,
  DEFAULT_WALLETS,
} from "@workspace/constants";
import { sendInvitationEmail } from "@workspace/email";
import { CategoriesRepository } from "../categories/categories.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { WalletGroupsRepository } from "../wallets/groups/groups.repository";
import { WalletsRepository } from "../wallets/wallets.repository";
import { db, pricing, eq } from "@workspace/database";
import { Env } from "@workspace/constants";
import { OrdersService } from "../orders/orders.service";
import { generateSlug } from "@workspace/utils";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { logger } from "@workspace/logger";
import {
  canManageSensitiveWorkspace,
  normalizeWorkspaceRole,
} from "./workspace-permissions";

/**
 * Workspaces service — business logic layer.
 * Workspace validation, slug generation, membership assignment.
 * No HTTP logic. No DB access.
 */
export abstract class WorkspacesService {
  /**
   * Create a new workspace and assign creator as owner.
   */
  static async createWorkspace(
    user_id: string,
    data: {
      name: string;
      country?: string;
      mainCurrencyCode?: string;
      mainCurrencySymbol?: string;
    },
    user_email?: string,
  ) {
    const { name, country, mainCurrencyCode, mainCurrencySymbol } = data;

    // Ensure the internal user row exists before linking workspace membership.
    // This can be missing when auth succeeds via Supabase token but sync has not run yet.
    const existingUser = await UsersRepository.findById(user_id);
    if (!existingUser) {
      if (!user_email) {
        throw new Error("User profile is not synced yet. Please sign in again.");
      }
      await UsersRepository.upsert({
        id: user_id,
        email: user_email,
        oauth_provider: "email",
      });
    }

    // 0. Check for existing workspaces (Plan Gating)
    const workspacesWithPlans =
      await WorkspacesRepository.getWorkspacesWithPlans(user_id);

    // Filter to only workspaces where the user is an owner/admin (who can create workspaces)
    // Actually, the limit should be based on the TOTAL workspaces a user is in, or just those they OWN?
    // User request: "maximum workspace".
    // Usually, this refers to ownership.
    const ownedWorkspaces = workspacesWithPlans.filter(w => w.role === 'owner');
    
    // Find the maximum limit from all plans the user is part of
    const maxAllowed = workspacesWithPlans.reduce((max, curr) => {
      const planLimit = curr.plan?.max_workspaces ?? 1; // Default to 1 if no plan
      return Math.max(max, planLimit);
    }, 1);

    if (ownedWorkspaces.length >= maxAllowed) {
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `You have reached the workspace limit for your current plan (Max: ${maxAllowed}). Please upgrade to create more workspaces.`,
        ),
      );
    }

    // 1. Parallelize initial setup: generate slug and find default plan
    const [slug, freePlan] = await Promise.all([
      (async () => generateSlug(name))(),
      db
        .select({ id: pricing.id })
        .from(pricing)
        .where(eq(pricing.name, "Free Tier"))
        .limit(1)
        .then((res) => res[0]),
    ]);

    // 2. Wrap creation in a transaction to rollback on partial failure
    const workspaceResult = await db.transaction(async (tx) => {
      const workspace = await WorkspacesRepository.create(
        {
          name,
          slug,
          country,
          plan_id: freePlan?.id,
          plan_status: "free",
        },
        tx,
      );

      if (!workspace) {
        throw new Error("Failed to create workspace");
      }

      // 3. Parallelize independent initialization tasks within the transaction
      await Promise.all([
        // A. Add user as owner
        WorkspacesRepository.addMember(
          {
            workspace_id: workspace.id,
            user_id,
            role: "owner",
          },
          tx,
        ),

        // B. Set as user's active workspace if they don't have one
        (async () => {
          const current_workspace_id = await UsersRepository.getWorkspaceId(
            user_id,
            tx,
          );
          if (!current_workspace_id) {
            await UsersRepository.setWorkspaceId(user_id, workspace.id, tx);
          }
        })(),

        // C. Populate default categories
        CategoriesRepository.createMany(
          [
            ...DEFAULT_INCOME_CATEGORIES.map((catName) => ({
              workspaceId: workspace.id,
              name: catName,
              type: "income" as const,
            })),
            ...DEFAULT_EXPENSE_CATEGORIES.map((catName) => ({
              workspaceId: workspace.id,
              name: catName,
              type: "expense" as const,
            })),
          ],
          tx,
        ),

        // D. Create default workspace settings
        SettingsRepository.create(
          workspace.id,
          {
            mainCurrencyCode,
            mainCurrencySymbol,
          } as any,
          tx,
        ),

        // Audit log moved outside transaction

        // F. Record initial free order
        OrdersService.createOrder(
          {
            workspace_id: workspace.id,
            user_id,
            amount: 0,
            currency: mainCurrencyCode?.toLowerCase() || "usd",
            status: "paid",
          },
          tx,
        ),

        // G. Handle wallet system (groups then items)
        (async () => {
          const defaultGroups = await WalletGroupsRepository.createMany(
            DEFAULT_WALLET_GROUPS.map((groupName) => ({
              workspaceId: workspace.id,
              name: groupName,
            })),
            tx,
          );

          const walletsToCreate: {
            workspaceId: string;
            groupId: string;
            name: string;
            balance: number;
            isIncludedInTotals: boolean;
          }[] = [];

          for (const groupConfig of DEFAULT_WALLETS) {
            const group = defaultGroups.find(
              (g: any) => g.name === groupConfig.group,
            );
            if (group) {
              for (const walletConfig of groupConfig.wallets) {
                walletsToCreate.push({
                  workspaceId: workspace.id,
                  groupId: group.id,
                  name: walletConfig.name,
                  balance: walletConfig.balance,
                  isIncludedInTotals: walletConfig.isIncludedInTotals,
                });
              }
            }
          }

          if (walletsToCreate.length > 0) {
            await WalletsRepository.createMany(walletsToCreate, tx);
          }
        })(),
      ]);

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      };
    });

    // E. Log action (after transaction commits to respect FK constraints)
    AuditLogsService
      .log({
        workspace_id: workspaceResult.id,
        user_id,
        action: "workspace.created",
        entity: "workspace",
        entity_id: workspaceResult.id,
        after: {
          name: workspaceResult.name,
          slug: workspaceResult.slug,
        },
      })
      .catch((err) => logger.error("Failed to log workspace creation", { err }));

    return workspaceResult;
  }

  /**
   * List all workspaces the user is a member of.
   */
  static async listWorkspaces(user_id: string) {
    const workspaces = await WorkspacesRepository.getMemberWorkspaces(user_id);
    return workspaces.map((workspace) => ({
      ...workspace,
      role: normalizeWorkspaceRole(workspace.role),
    }));
  }

  static async getActiveWorkspace(workspace_id: string) {
    return WorkspacesRepository.findById(workspace_id);
  }

  static async getMembers(workspace_id: string) {
    const members = await WorkspacesRepository.getMembers(workspace_id);
    return members.map((member) => ({
      ...member,
      role: normalizeWorkspaceRole(member.role),
    }));
  }

  /**
   * Invite a user to the workspace.
   */
  static async inviteMember(
    actor_id: string,
    workspace_id: string,
    email: string,
    role: "admin" | "editor" | "viewer",
  ) {
    // 1. Check if actor has permission (owner/admin)
    const actorMembership = await WorkspacesRepository.getMembership(
      actor_id,
      workspace_id,
    );
    if (!actorMembership || !canManageSensitiveWorkspace(actorMembership.role)) {
      throw new Error("Unauthorized to invite members");
    }

    // 2. Check if user is already a member
    const existingUser = await UsersRepository.findByEmail(email);
    if (existingUser) {
      const existingMembership = await WorkspacesRepository.getMembership(
        existingUser.id,
        workspace_id,
      );
      if (existingMembership) {
        throw new Error("User is already a member of this workspace");
      }
    }

    // 3. Check for pending invitation - delete if exists to allow re-invite
    const pendingInvite = await WorkspacesRepository.findPendingInvitation(
      workspace_id,
      email,
    );
    if (pendingInvite) {
      await WorkspacesRepository.deleteInvitation(pendingInvite.id);
    }

    // 4. Create token and invitation
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const invitation = await WorkspacesRepository.createInvitation({
      workspaceId: workspace_id,
      email,
      role,
      token,
      expiresAt,
    });

    if (!invitation) throw new Error("Failed to create invitation");

    // 5. Send email
    const workspace = await WorkspacesRepository.findById(workspace_id);
    if (workspace) {
      const inviteLink = `${Env.APP_URL}/accept-invite?token=${token}`;
      await sendInvitationEmail(email, workspace.name, inviteLink);
    }

    // 6. Log action
    await AuditLogsService.log({
      workspace_id,
      user_id: actor_id,
      action: "workspace.invitation_created",
      entity: "invitation",
      entity_id: invitation.id,
      after: { email, role },
    });

    return invitation;
  }

  static async getInvitations(workspace_id: string) {
    const invitations =
      await WorkspacesRepository.getWorkspaceInvitations(workspace_id);
    return invitations.map((invitation) => ({
      ...invitation,
      role: normalizeWorkspaceRole(invitation.role),
    }));
  }

  static async cancelInvitation(
    actor_id: string,
    workspace_id: string,
    invitation_id: string,
  ) {
    // Check permission
    const actorMembership = await WorkspacesRepository.getMembership(
      actor_id,
      workspace_id,
    );
    if (!actorMembership || !canManageSensitiveWorkspace(actorMembership.role)) {
      throw new Error("Unauthorized to cancel invitations");
    }

    await WorkspacesRepository.deleteInvitation(invitation_id);

    await AuditLogsService.log({
      workspace_id,
      user_id: actor_id,
      action: "workspace.invitation_cancelled",
      entity: "invitation",
      entity_id: invitation_id,
    });
  }

  static async acceptInvitation(email: string, user_id: string) {
    // 1. Find pending invitation
    // We need to iterate through all workspaces or find by email globally.
    // But findPendingInvitation requires workspaceId.
    // Actually, we want to find *any* pending invitation for this email.
    // So we need a repository method findPendingInvitationsByEmail(email).

    // For now, let's assume we check for a specific workspace if provided, or we need to implement findPendingInvitationsByEmail.
    // Let's rely on the repository to search by email.
    const invitations =
      await WorkspacesRepository.findPendingInvitationsByEmail(email);

    if (invitations.length === 0) return null;

    // Accept the first one (or handle multiple? For now, first one).
    const invitation = invitations[0];
    if (!invitation) return null;

    // 2. Add member
    await WorkspacesRepository.addMember({
      workspace_id: invitation.workspaceId,
      user_id,
      role: invitation.role,
    });

    // 3. Update invitation status
    await WorkspacesRepository.updateInvitationStatus(
      invitation.id,
      "accepted",
    );

    // 4. Set as active workspace if user has none
    const currentWorkspace = await UsersRepository.getWorkspaceId(user_id);
    if (!currentWorkspace) {
      await UsersRepository.setWorkspaceId(user_id, invitation.workspaceId);
    }

    // 5. Log action
    await AuditLogsService.log({
      workspace_id: invitation.workspaceId,
      user_id,
      action: "workspace.invitation_accepted",
      entity: "invitation",
      entity_id: invitation.id,
    });

    return invitation.workspaceId;
  }

  static async acceptInvitationByToken(token: string, user_id: string) {
    // 1. Find pending invitation by token
    const invitation = await WorkspacesRepository.findInvitationByToken(token);

    if (!invitation || invitation.status !== "pending") {
      throw new Error("Invalid or expired invitation");
    }

    // 2. Check expiry
    if (new Date() > new Date(invitation.expiresAt)) {
      await WorkspacesRepository.updateInvitationStatus(
        invitation.id,
        "expired",
      );
      throw new Error("Invitation has expired");
    }

    // 3. Add member if not already a member
    const existingMembership = await WorkspacesRepository.getMembership(
      user_id,
      invitation.workspaceId,
    );
    if (!existingMembership) {
      await WorkspacesRepository.addMember({
        workspace_id: invitation.workspaceId,
        user_id,
        role: invitation.role,
      });
    }

    // 4. Update invitation status
    await WorkspacesRepository.updateInvitationStatus(
      invitation.id,
      "accepted",
    );

    // 5. Set as active workspace if user has none
    const currentWorkspace = await UsersRepository.getWorkspaceId(user_id);
    if (!currentWorkspace) {
      await UsersRepository.setWorkspaceId(user_id, invitation.workspaceId);
    }

    // 6. Log action
    await AuditLogsService.log({
      workspace_id: invitation.workspaceId,
      user_id,
      action: "workspace.invitation_accepted",
      entity: "invitation",
      entity_id: invitation.id,
    });

    return invitation.workspaceId;
  }

  /**
   * Assert that the workspace is on a specific plan tier or higher.
   * Throws 422 if the requirement is not met.
   */
  static async assertPlanTier(
    workspace_id: string,
    requiredTier: "Pro" | "Business",
  ) {
    const workspace = await WorkspacesRepository.findById(workspace_id);
    if (!workspace) {
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"),
      );
    }

    const tierHierarchy: Record<string, number> = {
      Starter: 0,
      "Free Tier": 0,
      Pro: 1,
      Business: 2,
    };
    const currentTierName = workspace.plan?.name || "Starter";
    const currentTierLevel = tierHierarchy[currentTierName] ?? 0;
    const requiredLevel = tierHierarchy[requiredTier] ?? 1;

    if (currentTierLevel < requiredLevel) {
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `This feature requires a ${requiredTier} plan or higher. Please upgrade to continue.`,
        ),
      );
    }
  }
}
