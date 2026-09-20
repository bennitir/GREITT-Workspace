import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { mobileNotificationText } from "@/lib/i18n/mobile-notifications";
import { prisma } from "@/lib/prisma";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import { sendWebPush, webPushConfigured } from "@/lib/push/web-push";

export type PriorityNotificationReason = "PRIORITY_CHANGED" | "ASSIGNED_PRIORITY";

function isAlertPriority(priority: string) {
  return priority === "HIGH" || priority === "URGENT";
}

async function recipientUserIdsForWork(workOrderId: number, companyId: number) {
  const parts = await prisma.workPart.findMany({
    where: { workOrderId, companyId },
    select: {
      assignments: {
        where: { removedAt: null },
        select: {
          resourceKind: true,
          userId: true,
          employee: { select: { userId: true } },
          workResource: {
            select: {
              members: {
                where: { removedAt: null },
                select: { employee: { select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });

  const ids = new Set<number>();
  for (const part of parts) {
    for (const assignment of part.assignments) {
      if (assignment.userId) ids.add(assignment.userId);
      if (assignment.employee?.userId) ids.add(assignment.employee.userId);
      if (assignment.resourceKind === "TEAM") {
        for (const member of assignment.workResource?.members ?? []) {
          if (member.employee.userId) ids.add(member.employee.userId);
        }
      }
    }
  }
  return [...ids];
}

export async function notifyPriorityWork(options: {
  workOrderId: number;
  companyId: number;
  reason: PriorityNotificationReason;
  recipientUserIds?: number[];
}) {
  const work = await prisma.workOrder.findFirst({
    where: { id: options.workOrderId, companyId: options.companyId },
    include: { translations: true },
  });
  if (!work || !isAlertPriority(work.priority)) return;

  const requestedIds = options.recipientUserIds?.filter((id) => Number.isInteger(id) && id > 0);
  const recipientIds = requestedIds?.length
    ? [...new Set(requestedIds)]
    : await recipientUserIdsForWork(work.id, options.companyId);
  if (recipientIds.length === 0) return;

  const recipients = await prisma.user.findMany({
    where: { id: { in: recipientIds }, isActive: true },
    select: {
      id: true,
      settings: { select: { interfaceLanguage: true } },
      employeeProfiles: {
        where: { companyId: options.companyId, isActive: true },
        select: { preferredLanguage: true },
        take: 1,
      },
      pushSubscriptions: {
        where: { disabledAt: null },
        select: { id: true, endpoint: true, p256dh: true, auth: true, soundEnabled: true },
      },
    },
  });

  const operationalText = projectPersistedWorkOrderText(work);
  const sourceId = String(work.id);

  for (const recipient of recipients) {
    const language = normalizeUiLanguage(
      recipient.settings?.interfaceLanguage || recipient.employeeProfiles[0]?.preferredLanguage || "is",
    );
    const nt = mobileNotificationText(language);
    const localizedTitle =
      resolveWork10LocalizedText(operationalText.title, language)?.text ?? work.title;
    const priorityLabel = work.priority === "URGENT" ? nt.urgentTitle : nt.priorityTitle;
    const reasonText =
      options.reason === "ASSIGNED_PRIORITY" ? nt.assignedPriority : nt.priorityChanged;
    const title = `${priorityLabel}: ${localizedTitle}`;
    const body = [
      reasonText,
      work.address?.trim() || null,
      work.workNumber ? `#${work.workNumber}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ");

    // Vörn gegn tvísmelli/tvöfaldri server-action keyrslu. Sama raunatvik á ekki
    // að búa til margar símtilkynningar á örfáum sekúndum, en ný hækkun síðar
    // á samt að gefa nýtt hljóðmerki.
    const duplicateSince = new Date(Date.now() - 20_000);
    const duplicate = await prisma.userNotification.findFirst({
      where: {
        userId: recipient.id,
        companyId: options.companyId,
        notificationType: "WORK_PRIORITY",
        sourceType: "WORK_ORDER",
        sourceId,
        title,
        body,
        createdAt: { gte: duplicateSince },
      },
      select: { id: true },
    });
    if (duplicate) continue;

    const notification = await prisma.userNotification.create({
      data: {
        userId: recipient.id,
        companyId: options.companyId,
        notificationType: "WORK_PRIORITY",
        severity: work.priority === "URGENT" ? "URGENT" : "HIGH",
        title,
        body,
        href: `/mobile/verk/${work.id}`,
        sourceType: "WORK_ORDER",
        sourceId,
      },
    });

    if (!webPushConfigured() || recipient.pushSubscriptions.length === 0) continue;

    await prisma.userNotification.update({
      where: { id: notification.id },
      data: { pushAttemptedAt: new Date() },
    });

    let anyDelivered = false;
    for (const subscription of recipient.pushSubscriptions) {
      try {
        const response = await sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          {
            title,
            body,
            url: `/mobile/verk/${work.id}`,
            tag: `gloggt-work-priority-${work.id}`,
            notificationId: notification.id,
            silent: !subscription.soundEnabled,
            lang: language,
            renotify: true,
          },
          { ttlSeconds: 600, urgency: "high" },
        );

        if (response.ok) {
          anyDelivered = true;
          await prisma.userPushSubscription.update({
            where: { id: subscription.id },
            data: { lastSuccessAt: new Date(), failureCount: 0, disabledAt: null },
          });
        } else {
          const shouldDisable = response.status === 404 || response.status === 410;
          await prisma.userPushSubscription.update({
            where: { id: subscription.id },
            data: {
              lastFailureAt: new Date(),
              failureCount: { increment: 1 },
              disabledAt: shouldDisable ? new Date() : undefined,
            },
          });
        }
      } catch {
        await prisma.userPushSubscription.update({
          where: { id: subscription.id },
          data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
        });
      }
    }

    if (anyDelivered) {
      await prisma.userNotification.update({
        where: { id: notification.id },
        data: { pushDeliveredAt: new Date() },
      });
    }
  }
}

export async function priorityRecipientUserIdsForTeam(companyId: number, workResourceId: number) {
  const members = await prisma.workResourceMember.findMany({
    where: {
      companyId,
      workResourceId,
      removedAt: null,
      workResource: { kind: "TEAM", isActive: true },
      employee: { isActive: true },
    },
    select: { employee: { select: { userId: true } } },
  });
  return [...new Set(members.map((member) => member.employee.userId).filter((id): id is number => id !== null))];
}
