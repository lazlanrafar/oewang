import { workspacesRepository } from "./workspaces.repository";
import { usersRepository } from "../users/users.repository";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import {
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_WALLET_GROUPS,
  DEFAULT_WALLETS,
} from "@workspace/constants";
import { sendInvitationEmail } from "@workspace/email";
import { CategoriesRepository } from "../categories/categories.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { walletGroupsRepository } from "../wallets/groups/groups.repository";
import { walletsRepository } from "../wallets/wallets.repository";
import { db, pricing, eq } from "@workspace/database";
import { Env } from "@workspace/constants";

/**
 * Workspaces service — business logic layer.
 * Workspace validation, slug generation, membership assignment.
 * No HTTP logic. No DB access.
 */
export const workspacesService = {
  /**
   * Create a new workspace and assign creator as owner.
   */
  async createWorkspace(
    user_id: string,
    data: {
      name: string;
      country?: string;
      mainCurrencyCode?: string;
      mainCurrencySymbol?: string;
    },
  ) {
    const { name, country, mainCurrencyCode, mainCurrencySymbol } = data;
    // Generate slug
    const base_slug =
      name.toLowerCase().replace(/[^a-z0-9]/g, "-") || "workspace";
    const random_suffix = Math.random().toString(36).substring(2, 7);
    const slug = `${base_slug}-${random_suffix}`;

    // Find default Free Tier plan
    const [freePlan] = await db
      .select({ id: pricing.id })
      .from(pricing)
      .where(eq(pricing.name, "Free Tier"))
      .limit(1);

    // Create workspace
    const workspace = await workspacesRepository.create({
      name,
      slug,
      country,
      plan_id: freePlan?.id,
      plan_status: "free",
    });
    if (!workspace) {
      throw new Error("Failed to create workspace");
    }

    // Add user as owner (not admin — per rules, creator = owner)
    await workspacesRepository.addMember({
      workspace_id: workspace.id,
      user_id,
      role: "owner",
    });

    // Set as user's active workspace if they don't have one
    const current_workspace_id = await usersRepository.getWorkspaceId(user_id);
    if (!current_workspace_id) {
      await usersRepository.setWorkspaceId(user_id, workspace.id);
    }

    // 4. Populate default categories
    const defaultCategories = [
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
        workspaceId: workspace.id,
        name,
        type: "income" as const,
      })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
        workspaceId: workspace.id,
        name,
        type: "expense" as const,
      })),
    ];
    await CategoriesRepository.createMany(defaultCategories);

    // 5. Create default workspace settings
    await SettingsRepository.create(workspace.id, {
      mainCurrencyCode,
      mainCurrencySymbol,
    } as any);

    // 6. Populate default wallet groups
    const defaultGroups = await walletGroupsRepository.createMany(
      DEFAULT_WALLET_GROUPS.map((name) => ({
        workspaceId: workspace.id,
        name,
      })),
    );

    // 7. Populate default wallets
    const walletsToCreate: {
      workspaceId: string;
      groupId: string;
      name: string;
      balance: number;
      isIncludedInTotals: boolean;
    }[] = [];

    for (const groupConfig of DEFAULT_WALLETS) {
      const group = defaultGroups.find((g) => g.name === groupConfig.group);
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
      await walletsRepository.createMany(walletsToCreate);
    }

    // 8. Log action
    await auditLogsService.log({
      workspace_id: workspace.id,
      user_id,
      action: "workspace.created",
      entity: "workspace",
      entity_id: workspace.id,
      after: {
        name: workspace.name,
        slug: workspace.slug,
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    };
  },

  /**
   * List all workspaces the user is a member of.
   */
  async listWorkspaces(user_id: string) {
    return workspacesRepository.getMemberWorkspaces(user_id);
  },

  async getActiveWorkspace(workspace_id: string) {
    return workspacesRepository.findById(workspace_id);
  },

  async getMembers(workspace_id: string) {
    return workspacesRepository.getMembers(workspace_id);
  },

  /**
   * Invite a user to the workspace.
   */
  async inviteMember(
    actor_id: string,
    workspace_id: string,
    email: string,
    role: "admin" | "member",
  ) {
    // 1. Check if actor has permission (owner/admin)
    const actorMembership = await workspacesRepository.getMembership(
      actor_id,
      workspace_id,
    );
    if (
      !actorMembership ||
      (actorMembership.role !== "owner" && actorMembership.role !== "admin")
    ) {
      throw new Error("Unauthorized to invite members");
    }

    // 2. Check if user is already a member
    const existingUser = await usersRepository.findByEmail(email);
    if (existingUser) {
      const existingMembership = await workspacesRepository.getMembership(
        existingUser.id,
        workspace_id,
      );
      if (existingMembership) {
        throw new Error("User is already a member of this workspace");
      }
    }

    // 3. Check for pending invitation - delete if exists to allow re-invite
    const pendingInvite = await workspacesRepository.findPendingInvitation(
      workspace_id,
      email,
    );
    if (pendingInvite) {
      await workspacesRepository.deleteInvitation(pendingInvite.id);
    }

    // 4. Create token and invitation
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const invitation = await workspacesRepository.createInvitation({
      workspaceId: workspace_id,
      email,
      role,
      token,
      expiresAt,
    });

    if (!invitation) throw new Error("Failed to create invitation");

    // 5. Send email
    const workspace = await workspacesRepository.findById(workspace_id);
    if (workspace) {
      const inviteLink = `${Env.APP_URL}/accept-invite?token=${token}`;
      await sendInvitationEmail(email, workspace.name, inviteLink);
    }

    // 6. Log action
    await auditLogsService.log({
      workspace_id,
      user_id: actor_id,
      action: "workspace.invitation_created",
      entity: "invitation",
      entity_id: invitation.id,
      after: { email, role },
    });

    return invitation;
  },

  async getInvitations(workspace_id: string) {
    return workspacesRepository.getWorkspaceInvitations(workspace_id);
  },

  async cancelInvitation(
    actor_id: string,
    workspace_id: string,
    invitation_id: string,
  ) {
    // Check permission
    const actorMembership = await workspacesRepository.getMembership(
      actor_id,
      workspace_id,
    );
    if (
      !actorMembership ||
      (actorMembership.role !== "owner" && actorMembership.role !== "admin")
    ) {
      throw new Error("Unauthorized to cancel invitations");
    }

    await workspacesRepository.deleteInvitation(invitation_id);

    await auditLogsService.log({
      workspace_id,
      user_id: actor_id,
      action: "workspace.invitation_cancelled",
      entity: "invitation",
      entity_id: invitation_id,
    });
  },

  async acceptInvitation(email: string, user_id: string) {
    // 1. Find pending invitation
    // We need to iterate through all workspaces or find by email globally.
    // But findPendingInvitation requires workspaceId.
    // Actually, we want to find *any* pending invitation for this email.
    // So we need a repository method findPendingInvitationsByEmail(email).

    // For now, let's assume we check for a specific workspace if provided, or we need to implement findPendingInvitationsByEmail.
    // Let's rely on the repository to search by email.
    const invitations =
      await workspacesRepository.findPendingInvitationsByEmail(email);

    if (invitations.length === 0) return null;

    // Accept the first one (or handle multiple? For now, first one).
    const invitation = invitations[0];
    if (!invitation) return null;

    // 2. Add member
    await workspacesRepository.addMember({
      workspace_id: invitation.workspaceId,
      user_id,
      role: invitation.role,
    });

    // 3. Update invitation status
    await workspacesRepository.updateInvitationStatus(
      invitation.id,
      "accepted",
    );

    // 4. Set as active workspace if user has none
    const currentWorkspace = await usersRepository.getWorkspaceId(user_id);
    if (!currentWorkspace) {
      await usersRepository.setWorkspaceId(user_id, invitation.workspaceId);
    }

    // 5. Log action
    await auditLogsService.log({
      workspace_id: invitation.workspaceId,
      user_id,
      action: "workspace.invitation_accepted",
      entity: "invitation",
      entity_id: invitation.id,
    });

    return invitation.workspaceId;
  },

  async acceptInvitationByToken(token: string, user_id: string) {
    // 1. Find pending invitation by token
    const invitation = await workspacesRepository.findInvitationByToken(token);

    if (!invitation || invitation.status !== "pending") {
      throw new Error("Invalid or expired invitation");
    }

    // 2. Check expiry
    if (new Date() > new Date(invitation.expiresAt)) {
      await workspacesRepository.updateInvitationStatus(
        invitation.id,
        "expired",
      );
      throw new Error("Invitation has expired");
    }

    // 3. Add member if not already a member
    const existingMembership = await workspacesRepository.getMembership(
      user_id,
      invitation.workspaceId,
    );
    if (!existingMembership) {
      await workspacesRepository.addMember({
        workspace_id: invitation.workspaceId,
        user_id,
        role: invitation.role,
      });
    }

    // 4. Update invitation status
    await workspacesRepository.updateInvitationStatus(
      invitation.id,
      "accepted",
    );

    // 5. Set as active workspace if user has none
    const currentWorkspace = await usersRepository.getWorkspaceId(user_id);
    if (!currentWorkspace) {
      await usersRepository.setWorkspaceId(user_id, invitation.workspaceId);
    }

    // 6. Log action
    await auditLogsService.log({
      workspace_id: invitation.workspaceId,
      user_id,
      action: "workspace.invitation_accepted",
      entity: "invitation",
      entity_id: invitation.id,
    });

    return invitation.workspaceId;
  },
};
